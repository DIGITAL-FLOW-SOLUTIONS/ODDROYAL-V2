import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { 
  User, 
  Edit, 
  Key, 
  Shield,
  Mail,
  Calendar,
  LogOut
} from "lucide-react";
import { currencyUtils } from "@shared/schema";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

interface UserProfile {
  id: string;
  username: string;
  email: string;
  balance: string;
  isActive: boolean;
  createdAt: string;
}

const profileUpdateSchema = z.object({
  username: z.string().min(1, "Username is required").max(50, "Username must be 50 characters or less"),
  email: z.string().email("Please enter a valid email address")
});

type ProfileUpdateForm = z.infer<typeof profileUpdateSchema>;

function Profile() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  
  const form = useForm<ProfileUpdateForm>({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: {
      username: '',
      email: ''
    }
  });
  
  const { data: userProfile, isLoading } = useQuery<UserProfile>({
    queryKey: ['/api/auth/me'],
    enabled: !!localStorage.getItem('authToken')
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { username?: string; email?: string }) => {
      return apiRequest('PATCH', '/api/auth/profile', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      setIsEditing(false);
      toast({
        title: "Profile Updated",
        description: "Your profile has been successfully updated."
      });
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Failed to update profile. Please try again.",
        variant: "destructive"
      });
    }
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const sessionToken = localStorage.getItem('authToken');
      if (sessionToken) {
        await apiRequest('POST', '/api/auth/logout', { sessionToken });
      }
      localStorage.removeItem('authToken');
      return Promise.resolve();
    },
    onSuccess: () => {
      queryClient.clear();
      setLocation('/login');
      toast({
        title: "Logged Out",
        description: "You have been successfully logged out."
      });
    }
  });

  if (!userProfile && !isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <h2 className="text-2xl font-bold mb-4">Please log in to view your profile</h2>
            <Button onClick={() => setLocation('/login')} data-testid="button-login">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <p>Loading profile...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleEdit = () => {
    form.reset({
      username: userProfile?.username || '',
      email: userProfile?.email || ''
    });
    setIsEditing(true);
  };

  const onSubmit = (values: ProfileUpdateForm) => {
    const changes: { username?: string; email?: string } = {};
    
    if (values.username !== userProfile?.username) {
      changes.username = values.username;
    }
    
    if (values.email !== userProfile?.email) {
      changes.email = values.email;
    }
    
    if (Object.keys(changes).length > 0) {
      updateProfileMutation.mutate(changes);
    } else {
      setIsEditing(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center">
            <User className="h-8 w-8 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-profile-title">Profile</h1>
            <p className="text-muted-foreground">Manage your account settings</p>
          </div>
        </div>
        <Badge variant={userProfile?.isActive ? 'default' : 'destructive'} data-testid="badge-account-status">
          {userProfile?.isActive ? 'Active Account' : 'Inactive Account'}
        </Badge>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList>
          <TabsTrigger value="general" data-testid="tab-general">
            <User className="h-4 w-4 mr-2" />
            General
          </TabsTrigger>
          <TabsTrigger value="security" data-testid="tab-security">
            <Shield className="h-4 w-4 mr-2" />
            Security
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Personal Information</CardTitle>
              {!isEditing && (
                <Button variant="outline" onClick={handleEdit} data-testid="button-edit-profile">
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {isEditing ? (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Username</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-username" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" {...field} data-testid="input-email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex space-x-2">
                      <Button 
                        type="submit"
                        disabled={updateProfileMutation.isPending}
                        data-testid="button-save-profile"
                      >
                        {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
                      </Button>
                      <Button 
                        type="button"
                        variant="outline" 
                        onClick={() => setIsEditing(false)}
                        data-testid="button-cancel-edit"
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                </Form>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <label className="text-sm font-medium">Username</label>
                    </div>
                    <p className="text-lg" data-testid="text-username">{userProfile?.username}</p>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <label className="text-sm font-medium">Email</label>
                    </div>
                    <p className="text-lg" data-testid="text-email">{userProfile?.email}</p>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <label className="text-sm font-medium">Member Since</label>
                    </div>
                    <p className="text-lg" data-testid="text-member-since">
                      {userProfile ? new Date(userProfile.createdAt).toLocaleDateString() : ''}
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Shield className="h-4 w-4 text-muted-foreground" />
                      <label className="text-sm font-medium">Account Balance</label>
                    </div>
                    <p className="text-lg font-bold text-green-600" data-testid="text-balance">
                      {userProfile ? currencyUtils.formatCurrency(currencyUtils.poundsToCents(parseFloat(userProfile.balance))) : ''}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Security Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Key className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Password</p>
                      <p className="text-sm text-muted-foreground">Change your account password</p>
                    </div>
                  </div>
                  <Button variant="outline" data-testid="button-change-password">
                    Change Password
                  </Button>
                </div>
                
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Shield className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Two-Factor Authentication</p>
                      <p className="text-sm text-muted-foreground">Add an extra layer of security</p>
                    </div>
                  </div>
                  <Button variant="outline" data-testid="button-setup-2fa">
                    Setup 2FA
                  </Button>
                </div>
              </div>
              
              <Separator />
              
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-destructive">Danger Zone</h3>
                <div className="flex items-center justify-between p-4 border border-destructive rounded-lg">
                  <div>
                    <p className="font-medium">Logout</p>
                    <p className="text-sm text-muted-foreground">Sign out of your account</p>
                  </div>
                  <Button 
                    variant="destructive" 
                    onClick={() => logoutMutation.mutate()}
                    disabled={logoutMutation.isPending}
                    data-testid="button-logout"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    {logoutMutation.isPending ? "Logging out..." : "Logout"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default Profile;