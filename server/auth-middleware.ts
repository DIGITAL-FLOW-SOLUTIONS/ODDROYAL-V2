import { Request, Response, NextFunction } from 'express';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { supabaseAdmin } from './supabase';
import { logger } from "./logger";

// Extend Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email?: string;
        role?: string;
        aud: string;
        exp: number;
      };
    }
  }
}

// Create JWKS with the correct Supabase endpoint
const JWKS = createRemoteJWKSet(new URL(`${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`));

// Fallback function to verify JWT by calling Supabase auth directly
async function verifyTokenWithSupabase(token: string) {
  try {
    const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': process.env.SUPABASE_ANON_KEY!,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Token verification failed');
    }

    const userData = await response.json();
    return userData;
  } catch (error) {
    throw new Error('Token verification failed');
  }
}

export async function authenticateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.substring(7);
    let userPayload: any = null;
    
    // First try JWKS verification
    try {
      const { payload } = await jwtVerify(token, JWKS, {
        issuer: `${process.env.SUPABASE_URL}/auth/v1`,
        audience: 'authenticated',
      });
      userPayload = payload;
    } catch (jwksError) {
      logger.debug('JWKS verification failed, trying direct Supabase verification:', jwksError.message);
      
      // Fallback to direct Supabase verification
      try {
        const userData = await verifyTokenWithSupabase(token);
        userPayload = {
          sub: userData.id,
          email: userData.email,
          aud: userData.aud || 'authenticated'
        };
      } catch (fallbackError) {
        logger.error('Both JWKS and Supabase verification failed:', fallbackError);
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
    }

    if (!userPayload || !userPayload.sub) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }

    // Check if user exists and is active in our users table
    const { data: profile, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', userPayload.sub)
      .single();

    if (error || !profile) {
      return res.status(401).json({ error: 'User profile not found' });
    }

    if (!profile.is_active) {
      return res.status(403).json({ error: 'User account is inactive' });
    }

    req.user = {
      id: userPayload.sub,
      email: userPayload.email as string,
      aud: userPayload.aud as string,
      exp: userPayload.exp || Math.floor(Date.now() / 1000) + 3600, // Default 1 hour if not present
    };

    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export async function authenticateAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.substring(7);
    let userPayload: any = null;
    
    // First try JWKS verification
    try {
      const { payload } = await jwtVerify(token, JWKS, {
        issuer: `${process.env.SUPABASE_URL}/auth/v1`,
        audience: 'authenticated',
      });
      userPayload = payload;
    } catch (jwksError) {
      logger.debug('Admin JWKS verification failed, trying direct Supabase verification:', jwksError.message);
      
      // Fallback to direct Supabase verification
      try {
        const userData = await verifyTokenWithSupabase(token);
        userPayload = {
          sub: userData.id,
          email: userData.email,
          aud: userData.aud || 'authenticated'
        };
      } catch (fallbackError) {
        logger.error('Both JWKS and Supabase verification failed for admin:', fallbackError);
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
    }

    if (!userPayload || !userPayload.sub) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }

    // Check if user is an admin
    const { data: adminUser, error } = await supabaseAdmin
      .from('admin_users')
      .select('*')
      .eq('id', userPayload.sub)
      .single();

    if (error || !adminUser) {
      return res.status(403).json({ error: 'Access denied: Admin privileges required' });
    }

    if (!adminUser.is_active) {
      return res.status(403).json({ error: 'Admin account is inactive' });
    }

    req.user = {
      id: userPayload.sub,
      email: userPayload.email as string,
      role: adminUser.role,
      aud: userPayload.aud as string,
      exp: userPayload.exp || Math.floor(Date.now() / 1000) + 3600, // Default 1 hour if not present
    };

    next();
  } catch (error) {
    logger.error('Admin authentication error:', error);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}