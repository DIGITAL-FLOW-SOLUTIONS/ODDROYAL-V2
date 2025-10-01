import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { 
  Search, 
  Filter, 
  RefreshCw, 
  UserPlus, 
  MoreHorizontal,
  Eye,
  Lock,
  Unlock,
  DollarSign,
  ShieldOff,
  Shield,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Upload,
  Trash2,
  CheckSquare,
  Square
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { queryClient, adminApiRequest } from "@/lib/queryClient";
import { currencyUtils } from "@shared/schema";

// Types
interface User {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  balance: number; // in cents
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
}

interface UserFilters {
  search: string;
  status: 'all' | 'active' | 'inactive';
  balanceMin: string;
  balanceMax: string;
  dateFrom: string;
  dateTo: string;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
}

const ITEMS_PER_PAGE_OPTIONS = [25, 50, 100, 200];

export default function AdminUserManagement() {
  const { toast } = useToast();
  
  // State management
  const [filters, setFilters] = useState<UserFilters>({
    search: '',
    status: 'all',
    balanceMin: '',
    balanceMax: '',
    dateFrom: '',
    dateTo: ''
  });
  
  // Separate state for search input to enable debouncing
  const [searchInput, setSearchInput] = useState('');
  
  // Debounced search effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setFilters(prev => ({ ...prev, search: searchInput }));
      setPagination(prev => ({ ...prev, page: 1 }));
    }, 500);
    
    return () => clearTimeout(timeoutId);
  }, [searchInput]);
  
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 50,
    total: 0
  });
  
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showUserDetail, setShowUserDetail] = useState(false);
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [bulkAction, setBulkAction] = useState<'activate' | 'deactivate' | 'delete' | null>(null);
  
  // Balance adjustment state
  const [balanceAdjustment, setBalanceAdjustment] = useState({
    type: 'credit' as 'credit' | 'debit',
    amount: '',
    reason: ''
  });
  
  // Balance validation
  const validateBalanceAdjustment = useCallback(() => {
    const errors: string[] = [];
    
    if (!balanceAdjustment.amount || balanceAdjustment.amount === '0') {
      errors.push('Amount is required and must be greater than 0');
    }
    
    const amount = parseFloat(balanceAdjustment.amount);
    if (isNaN(amount) || amount <= 0) {
      errors.push('Amount must be a positive number');
    }
    
    if (amount > 10000) {
      errors.push('Amount cannot exceed £10,000 per adjustment');
    }
    
    if (!balanceAdjustment.reason.trim()) {
      errors.push('Reason is required for balance adjustments');
    }
    
    if (balanceAdjustment.reason.length < 5) {
      errors.push('Reason must be at least 5 characters long');
    }
    
    return errors;
  }, [balanceAdjustment]);
  
  const balanceValidationErrors = useMemo(() => validateBalanceAdjustment(), [validateBalanceAdjustment]);

  // Fetch users with React Query
  const { data: usersResponse, isLoading, error, refetch } = useQuery({
    queryKey: [
      '/api/admin/customers',
      pagination.page,
      pagination.limit,
      filters.search,
      filters.status,
      filters.balanceMin,
      filters.balanceMax,
      filters.dateFrom,
      filters.dateTo
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: pagination.limit.toString(),
        offset: ((pagination.page - 1) * pagination.limit).toString(),
      });

      if (filters.search) params.append('search', filters.search);
      if (filters.status !== 'all') {
        params.append('isActive', (filters.status === 'active').toString());
      }
      // Add balance range filters (convert pounds to cents for API)
      if (filters.balanceMin) {
        const minCents = currencyUtils.poundsToCents(filters.balanceMin);
        params.append('balanceMin', minCents.toString());
      }
      if (filters.balanceMax) {
        const maxCents = currencyUtils.poundsToCents(filters.balanceMax);
        params.append('balanceMax', maxCents.toString());
      }
      // Add date range filters
      if (filters.dateFrom) {
        params.append('dateFrom', filters.dateFrom);
      }
      if (filters.dateTo) {
        params.append('dateTo', filters.dateTo);
      }

      const response = await adminApiRequest('GET', `/api/admin/customers?${params.toString()}`);
      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const users = usersResponse?.data?.users || [];
  const totalUsers = usersResponse?.data?.total || 0;

  // Update pagination total when data changes
  useEffect(() => {
    setPagination(prev => ({ ...prev, total: totalUsers }));
  }, [totalUsers]);

  // Mutations for user actions
  const updateUserStatusMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      const response = await adminApiRequest('PATCH', `/api/admin/customers/${userId}/status`, { isActive });
      
      if (!response.ok) {
        throw new Error('Failed to update user status');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/customers'] });
      toast({
        title: "Success",
        description: "User status updated successfully",
      });
      setShowStatusModal(false);
      setSelectedUser(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update user status",
        variant: "destructive",
      });
    },
  });

  const adjustBalanceMutation = useMutation({
    mutationFn: async ({ userId, amount, type, reason }: { 
      userId: string; 
      amount: number; 
      type: 'credit' | 'debit';
      reason: string;
    }) => {
      // Amount is already expected to be in cents from the caller
      const response = await adminApiRequest('PATCH', `/api/admin/customers/${userId}/balance`, {
        amount: type === 'credit' ? amount : -amount,
        reason
      });
      
      if (!response.ok) {
        throw new Error('Failed to adjust balance');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/customers'] });
      toast({
        title: "Success",
        description: "Balance adjusted successfully",
      });
      setShowBalanceModal(false);
      setSelectedUser(null);
      setBalanceAdjustment({ type: 'credit', amount: '', reason: '' });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to adjust balance",
        variant: "destructive",
      });
    },
  });

  // Helper functions
  const handleFilterChange = (key: keyof UserFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page on filter change
  };

  const clearFilters = () => {
    setFilters({
      search: '',
      status: 'all',
      balanceMin: '',
      balanceMax: '',
      dateFrom: '',
      dateTo: ''
    });
    setSearchInput(''); // Clear search input too
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleSelectUser = (userId: string, selected: boolean) => {
    const newSelected = new Set(selectedUsers);
    if (selected) {
      newSelected.add(userId);
    } else {
      newSelected.delete(userId);
    }
    setSelectedUsers(newSelected);
  };

  const handleSelectAll = (selected: boolean) => {
    if (selected) {
      setSelectedUsers(new Set(users.map((user: User) => user.id)));
    } else {
      setSelectedUsers(new Set());
    }
  };

  const handlePageChange = (newPage: number) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  };

  const handleLimitChange = (newLimit: string) => {
    setPagination(prev => ({ 
      ...prev, 
      limit: parseInt(newLimit), 
      page: 1 
    }));
  };

  const openUserDetail = (user: User) => {
    setSelectedUser(user);
    setShowUserDetail(true);
  };

  const openBalanceModal = (user: User) => {
    setSelectedUser(user);
    setShowBalanceModal(true);
  };

  const openStatusModal = (user: User) => {
    setSelectedUser(user);
    setShowStatusModal(true);
  };

  const handleBulkAction = (action: 'activate' | 'deactivate' | 'delete') => {
    if (selectedUsers.size === 0) {
      toast({
        title: "No Selection",
        description: "Please select users to perform bulk actions",
        variant: "destructive",
      });
      return;
    }
    setBulkAction(action);
  };

  const confirmBulkAction = async () => {
    if (!bulkAction) return;

    try {
      const promises = Array.from(selectedUsers).map(userId => {
        switch (bulkAction) {
          case 'activate':
            return updateUserStatusMutation.mutateAsync({ userId, isActive: true });
          case 'deactivate':
            return updateUserStatusMutation.mutateAsync({ userId, isActive: false });
          case 'delete':
            // Note: implement delete endpoint if needed
            throw new Error('Bulk delete not implemented');
          default:
            return Promise.resolve();
        }
      });

      await Promise.all(promises);
      
      toast({
        title: "Success",
        description: `${selectedUsers.size} users ${bulkAction}d successfully`,
      });
      
      setSelectedUsers(new Set());
      setBulkAction(null);
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to ${bulkAction} users`,
        variant: "destructive",
      });
    }
  };

  const totalPages = Math.ceil(totalUsers / pagination.limit);
  const startItem = (pagination.page - 1) * pagination.limit + 1;
  const endItem = Math.min(pagination.page * pagination.limit, totalUsers);

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl md:text-3xl font-bold tracking-tight truncate" data-testid="text-users-title">
            User Management
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground truncate">
            Manage customer accounts, balances, and permissions
          </p>
        </div>
        <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            data-testid="button-refresh-users"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-testid="button-export-users"
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search by username, email, or ID..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-10"
                data-testid="input-search-users"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              data-testid="button-toggle-filters"
            >
              <Filter className="w-4 h-4 mr-2" />
              Filters
              {Object.values(filters).some(v => v && v !== 'all') && (
                <Badge variant="secondary" className="ml-2">
                  Active
                </Badge>
              )}
            </Button>
          </div>

          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-t pt-4 space-y-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <div>
                  <Label htmlFor="status-filter">Status</Label>
                  <Select
                    value={filters.status}
                    onValueChange={(value) => handleFilterChange('status', value)}
                  >
                    <SelectTrigger id="status-filter" data-testid="select-status-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Users</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="balance-min">Min Balance (£)</Label>
                  <Input
                    id="balance-min"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={filters.balanceMin}
                    onChange={(e) => handleFilterChange('balanceMin', e.target.value)}
                    data-testid="input-balance-min-filter"
                  />
                </div>

                <div>
                  <Label htmlFor="balance-max">Max Balance (£)</Label>
                  <Input
                    id="balance-max"
                    type="number"
                    step="0.01"
                    placeholder="10000.00"
                    value={filters.balanceMax}
                    onChange={(e) => handleFilterChange('balanceMax', e.target.value)}
                    data-testid="input-balance-max-filter"
                  />
                </div>

                <div>
                  <Label htmlFor="date-from">From Date</Label>
                  <Input
                    id="date-from"
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                    data-testid="input-date-from-filter"
                  />
                </div>

                <div>
                  <Label htmlFor="date-to">To Date</Label>
                  <Input
                    id="date-to"
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                    data-testid="input-date-to-filter"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearFilters}
                  data-testid="button-clear-filters"
                >
                  Clear Filters
                </Button>
              </div>
            </motion.div>
          )}
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {selectedUsers.size > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  {selectedUsers.size} user{selectedUsers.size !== 1 ? 's' : ''} selected
                </span>
                <Separator orientation="vertical" className="h-6" />
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleBulkAction('activate')}
                    data-testid="button-bulk-activate"
                  >
                    <Unlock className="w-4 h-4 mr-2" />
                    Activate
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleBulkAction('deactivate')}
                    data-testid="button-bulk-deactivate"
                  >
                    <Lock className="w-4 h-4 mr-2" />
                    Deactivate
                  </Button>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedUsers(new Set())}
                data-testid="button-clear-selection"
              >
                Clear Selection
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Users Table */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center justify-between">
            <span>Users ({totalUsers.toLocaleString()})</span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Show:</span>
              <Select
                value={pagination.limit.toString()}
                onValueChange={handleLimitChange}
              >
                <SelectTrigger className="w-20" data-testid="select-items-per-page">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ITEMS_PER_PAGE_OPTIONS.map(option => (
                    <SelectItem key={option} value={option.toString()}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedUsers.size === users.length && users.length > 0}
                      onCheckedChange={handleSelectAll}
                      data-testid="checkbox-select-all-users"
                    />
                  </TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell colSpan={9} className="h-12">
                        <div className="flex items-center justify-center">
                          <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                          Loading users...
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8">
                      <div className="text-muted-foreground">
                        {filters.search || filters.status !== 'all' ? 
                          'No users found matching your filters' : 
                          'No users found'
                        }
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user: User) => (
                    <TableRow key={user.id} className="hover-elevate">
                      <TableCell>
                        <Checkbox
                          checked={selectedUsers.has(user.id)}
                          onCheckedChange={(checked) => 
                            handleSelectUser(user.id, checked as boolean)
                          }
                          data-testid={`checkbox-select-user-${user.id}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <span data-testid={`text-username-${user.id}`}>
                          {user.username}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span data-testid={`text-email-${user.id}`}>
                          {user.email}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span data-testid={`text-name-${user.id}`}>
                          {user.firstName || user.lastName ? 
                            `${user.firstName || ''} ${user.lastName || ''}`.trim() : 
                            '-'
                          }
                        </span>
                      </TableCell>
                      <TableCell>
                        <span 
                          className="font-medium"
                          data-testid={`text-balance-${user.id}`}
                        >
                          {currencyUtils.formatCurrency(user.balance)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={user.isActive ? "default" : "secondary"}
                          data-testid={`badge-status-${user.id}`}
                        >
                          {user.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span data-testid={`text-created-${user.id}`}>
                          {format(new Date(user.createdAt), 'MMM dd, yyyy')}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span data-testid={`text-last-login-${user.id}`}>
                          {user.lastLogin ? 
                            format(new Date(user.lastLogin), 'MMM dd, yyyy') : 
                            'Never'
                          }
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openUserDetail(user)}
                            data-testid={`button-view-user-${user.id}`}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openBalanceModal(user)}
                            data-testid={`button-adjust-balance-${user.id}`}
                          >
                            <DollarSign className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openStatusModal(user)}
                            data-testid={`button-toggle-status-${user.id}`}
                          >
                            {user.isActive ? 
                              <Lock className="w-4 h-4" /> : 
                              <Unlock className="w-4 h-4" />
                            }
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Showing {startItem.toLocaleString()} to {endItem.toLocaleString()} of {totalUsers.toLocaleString()} users
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(1)}
                  disabled={pagination.page === 1}
                  data-testid="button-first-page"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page === 1}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm">
                  Page {pagination.page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page === totalPages}
                  data-testid="button-next-page"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(totalPages)}
                  disabled={pagination.page === totalPages}
                  data-testid="button-last-page"
                >
                  <ChevronsRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* User Detail Modal */}
      <Dialog open={showUserDetail} onOpenChange={setShowUserDetail}>
        <DialogContent className="max-w-2xl" data-testid="dialog-user-detail">
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
            <DialogDescription>
              View detailed information about this user account
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Username</Label>
                  <div className="text-sm font-medium">{selectedUser.username}</div>
                </div>
                <div>
                  <Label>Email</Label>
                  <div className="text-sm font-medium">{selectedUser.email}</div>
                </div>
                <div>
                  <Label>Full Name</Label>
                  <div className="text-sm font-medium">
                    {selectedUser.firstName || selectedUser.lastName ? 
                      `${selectedUser.firstName || ''} ${selectedUser.lastName || ''}`.trim() : 
                      'Not provided'
                    }
                  </div>
                </div>
                <div>
                  <Label>Status</Label>
                  <Badge variant={selectedUser.isActive ? "default" : "secondary"}>
                    {selectedUser.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <div>
                  <Label>Balance</Label>
                  <div className="text-sm font-medium">
                    {currencyUtils.formatCurrency(selectedUser.balance)}
                  </div>
                </div>
                <div>
                  <Label>Registration Date</Label>
                  <div className="text-sm font-medium">
                    {format(new Date(selectedUser.createdAt), 'PPP')}
                  </div>
                </div>
                <div>
                  <Label>Last Login</Label>
                  <div className="text-sm font-medium">
                    {selectedUser.lastLogin ? 
                      format(new Date(selectedUser.lastLogin), 'PPP') : 
                      'Never'
                    }
                  </div>
                </div>
                <div>
                  <Label>User ID</Label>
                  <div className="text-sm font-medium font-mono">{selectedUser.id}</div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowUserDetail(false)}
              data-testid="button-close-user-detail"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Balance Adjustment Modal */}
      <Dialog open={showBalanceModal} onOpenChange={setShowBalanceModal}>
        <DialogContent data-testid="dialog-balance-adjustment">
          <DialogHeader>
            <DialogTitle>Adjust User Balance</DialogTitle>
            <DialogDescription>
              Credit or debit funds to {selectedUser?.username}'s account
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Current Balance</Label>
              <div className="text-lg font-semibold" data-testid="text-current-balance">
                {selectedUser && currencyUtils.formatCurrency(selectedUser.balance)}
              </div>
            </div>
            {balanceValidationErrors.length > 0 && (
              <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/20 dark:text-red-400 p-3 rounded-md border border-red-200 dark:border-red-900">
                <ul className="space-y-1">
                  {balanceValidationErrors.map((error, index) => (
                    <li key={index} data-testid={`validation-error-${index}`}>• {error}</li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <Label>Action Type</Label>
              <Select
                value={balanceAdjustment.type}
                onValueChange={(value: 'credit' | 'debit') => 
                  setBalanceAdjustment(prev => ({ ...prev, type: value }))
                }
              >
                <SelectTrigger data-testid="select-balance-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit">Credit (Add funds)</SelectItem>
                  <SelectItem value="debit">Debit (Remove funds)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount (£)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                max="10000"
                placeholder="0.00"
                value={balanceAdjustment.amount}
                onChange={(e) => 
                  setBalanceAdjustment(prev => ({ ...prev, amount: e.target.value }))
                }
                data-testid="input-balance-amount"
              />
            </div>
            <div>
              <Label>Reason</Label>
              <Textarea
                placeholder="Enter reason for balance adjustment (minimum 5 characters)..."
                value={balanceAdjustment.reason}
                onChange={(e) => 
                  setBalanceAdjustment(prev => ({ ...prev, reason: e.target.value }))
                }
                data-testid="textarea-balance-reason"
                minLength={5}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowBalanceModal(false);
                setBalanceAdjustment({ type: 'credit', amount: '', reason: '' });
              }}
              data-testid="button-cancel-balance-adjustment"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (balanceValidationErrors.length > 0) {
                  toast({
                    title: "Validation Error",
                    description: "Please fix the validation errors above",
                    variant: "destructive",
                  });
                  return;
                }
                
                if (!selectedUser) {
                  toast({
                    title: "Error",
                    description: "No user selected",
                    variant: "destructive",
                  });
                  return;
                }
                
                adjustBalanceMutation.mutate({
                  userId: selectedUser.id,
                  amount: currencyUtils.poundsToCents(parseFloat(balanceAdjustment.amount)),
                  type: balanceAdjustment.type,
                  reason: balanceAdjustment.reason
                });
              }}
              disabled={adjustBalanceMutation.isPending || balanceValidationErrors.length > 0}
              data-testid="button-confirm-balance-adjustment"
            >
              {adjustBalanceMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                `${balanceAdjustment.type === 'credit' ? 'Credit' : 'Debit'} ${balanceAdjustment.amount ? `£${balanceAdjustment.amount}` : 'Amount'}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status Change Modal */}
      <Dialog open={showStatusModal} onOpenChange={setShowStatusModal}>
        <DialogContent data-testid="dialog-status-change">
          <DialogHeader>
            <DialogTitle>Change User Status</DialogTitle>
            <DialogDescription>
              {selectedUser?.isActive ? 'Deactivate' : 'Activate'} user account for {selectedUser?.username}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              {selectedUser?.isActive ? 
                'Deactivating this user will prevent them from logging in and placing bets.' :
                'Activating this user will allow them to log in and place bets normally.'
              }
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowStatusModal(false)}
              data-testid="button-cancel-status-change"
            >
              Cancel
            </Button>
            <Button
              variant={selectedUser?.isActive ? "destructive" : "default"}
              onClick={() => {
                if (selectedUser) {
                  updateUserStatusMutation.mutate({
                    userId: selectedUser.id,
                    isActive: !selectedUser.isActive
                  });
                }
              }}
              disabled={updateUserStatusMutation.isPending}
              data-testid="button-confirm-status-change"
            >
              {updateUserStatusMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                selectedUser?.isActive ? 'Deactivate User' : 'Activate User'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Action Confirmation */}
      <Dialog open={bulkAction !== null} onOpenChange={() => setBulkAction(null)}>
        <DialogContent data-testid="dialog-bulk-action">
          <DialogHeader>
            <DialogTitle>Confirm Bulk Action</DialogTitle>
            <DialogDescription>
              Are you sure you want to {bulkAction} {selectedUsers.size} selected user{selectedUsers.size !== 1 ? 's' : ''}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkAction(null)}
              data-testid="button-cancel-bulk-action"
            >
              Cancel
            </Button>
            <Button
              variant={bulkAction === 'delete' ? "destructive" : "default"}
              onClick={confirmBulkAction}
              data-testid="button-confirm-bulk-action"
            >
              Confirm {bulkAction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}