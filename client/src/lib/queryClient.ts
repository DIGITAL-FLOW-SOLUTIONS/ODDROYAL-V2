import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let errorMessage: string;
    
    try {
      // Try to parse as JSON first to extract user-friendly error messages
      const errorData = await res.json();
      if (errorData && typeof errorData === 'object') {
        // Check multiple common error field patterns
        const message = errorData.error || 
                       errorData.message || 
                       errorData.msg || 
                       errorData.detail ||
                       (Array.isArray(errorData.errors) ? errorData.errors[0] : null) ||
                       (errorData.error && errorData.error.message ? errorData.error.message : null);
        
        if (message) {
          errorMessage = typeof message === 'string' ? message : JSON.stringify(message);
        } else {
          // Fallback to status text if no structured error found
          errorMessage = res.statusText || `HTTP ${res.status}`;
        }
      } else {
        // Fallback to status text if not a structured object
        errorMessage = res.statusText || `HTTP ${res.status}`;
      }
    } catch {
      // If JSON parsing fails, get the text response
      try {
        errorMessage = (await res.text()) || res.statusText || `HTTP ${res.status}`;
      } catch {
        // Final fallback if everything fails
        errorMessage = res.statusText || `HTTP ${res.status}`;
      }
    }
    
    throw new Error(errorMessage);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const authToken = localStorage.getItem('authToken');
  const adminAuthToken = localStorage.getItem('adminAuthToken');
  const csrfToken = localStorage.getItem('adminCSRFToken');
  const headers: Record<string, string> = data ? { "Content-Type": "application/json" } : {};
  
  // Use admin token for admin routes, regular token for user routes
  const isAdminRoute = url.startsWith('/api/admin');
  if (isAdminRoute && adminAuthToken) {
    headers['Authorization'] = `Bearer ${adminAuthToken}`;
    
    // Add CSRF token for state-changing admin operations
    if (method !== 'GET' && method !== 'HEAD' && csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
  } else if (!isAdminRoute && authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

// Admin-specific API request function with automatic CSRF token handling
export async function adminApiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const adminAuthToken = localStorage.getItem('adminAuthToken');
  const csrfToken = localStorage.getItem('adminCSRFToken');
  const headers: Record<string, string> = data ? { "Content-Type": "application/json" } : {};
  
  if (adminAuthToken) {
    headers['Authorization'] = `Bearer ${adminAuthToken}`;
  }
  
  // Add CSRF token for state-changing operations
  if (method !== 'GET' && method !== 'HEAD' && csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  // Enhanced CSRF token error handling with automatic refresh
  if (res.status === 403) {
    const errorData = await res.json().catch(() => null);
    if (errorData?.error?.includes('CSRF')) {
      // Clear invalid CSRF token
      localStorage.removeItem('adminCSRFToken');
      
      // Try to refresh CSRF token automatically
      try {
        const refreshResponse = await fetch('/api/admin/csrf-token', {
          credentials: "include",
          headers: {
            'Authorization': `Bearer ${adminAuthToken}`
          }
        });
        
        if (refreshResponse.ok) {
          const refreshResult = await refreshResponse.json();
          const newCSRFToken = refreshResponse.headers.get('X-CSRF-Token') || refreshResult.data?.csrfToken;
          
          if (newCSRFToken) {
            localStorage.setItem('adminCSRFToken', newCSRFToken);
            
            // Retry the original request with new CSRF token
            const retryHeaders = { ...headers };
            retryHeaders['X-CSRF-Token'] = newCSRFToken;
            
            const retryRes = await fetch(url, {
              method,
              headers: retryHeaders,
              body: data ? JSON.stringify(data) : undefined,
              credentials: "include",
            });
            
            await throwIfResNotOk(retryRes);
            return retryRes;
          }
        }
      } catch (refreshError) {
        console.error('Failed to refresh CSRF token:', refreshError);
      }
      
      throw new Error('CSRF_TOKEN_INVALID');
    }
  }

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const authToken = localStorage.getItem('authToken');
    const headers: Record<string, string> = {};
    
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
