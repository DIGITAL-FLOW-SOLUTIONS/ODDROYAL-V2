import { Request, Response, NextFunction } from 'express';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { supabaseAdmin } from './supabase';

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

const JWKS = createRemoteJWKSet(new URL(`${process.env.SUPABASE_URL}/rest/v1/jwks`));

export async function authenticateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.substring(7);
    
    // Verify JWT token with Supabase
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: process.env.SUPABASE_URL,
      audience: 'authenticated',
    });

    // Check if user exists and is active in our profiles table
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', payload.sub)
      .single();

    if (error || !profile) {
      return res.status(401).json({ error: 'User profile not found' });
    }

    if (!profile.is_active) {
      return res.status(403).json({ error: 'User account is inactive' });
    }

    req.user = {
      id: payload.sub!,
      email: payload.email as string,
      aud: payload.aud as string,
      exp: payload.exp!,
    };

    next();
  } catch (error) {
    console.error('Authentication error:', error);
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
    
    // Verify JWT token with Supabase
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: process.env.SUPABASE_URL,
      audience: 'authenticated',
    });

    // Check if user is an admin
    const { data: adminUser, error } = await supabaseAdmin
      .from('admin_users')
      .select('*')
      .eq('id', payload.sub)
      .single();

    if (error || !adminUser) {
      return res.status(403).json({ error: 'Access denied: Admin privileges required' });
    }

    if (!adminUser.is_active) {
      return res.status(403).json({ error: 'Admin account is inactive' });
    }

    req.user = {
      id: payload.sub!,
      email: payload.email as string,
      role: adminUser.role,
      aud: payload.aud as string,
      exp: payload.exp!,
    };

    next();
  } catch (error) {
    console.error('Admin authentication error:', error);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}