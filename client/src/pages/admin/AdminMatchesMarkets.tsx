import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { format, parseISO } from "date-fns";
import { 
  Search, 
  Filter, 
  RefreshCw, 
  Plus, 
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  Calendar,
  MapPin,
  Target,
  Activity,
  Download,
  Upload,
  PlayCircle,
  PauseCircle,
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Trophy,
  Zap,
  Globe,
  Timer,
  Settings,
  DollarSign,
  AlertCircle,
  TrendingUp,
  Info,
  Shield,
  AlertTriangle,
  type LucideIcon
} from "lucide-react";
import { 
  SiFootballball, 
  SiHockey, 
  SiTennis, 
  SiBasketball, 
  SiBaseball, 
  SiVolleyball, 
  SiRugby 
} from "react-icons/si";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { queryClient, adminApiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

// Types
interface Match {
  id: string;
  externalId?: string;
  sport: string;
  sportId?: string;
  sportName?: string;
  leagueId: string;
  leagueName: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  kickoffTime: string;
  status: 'scheduled' | 'live' | 'finished' | 'cancelled' | 'postponed';
  homeScore?: number;
  awayScore?: number;
  isManual: boolean;
  marketsCount: number;
  totalExposure: number;
  simulatedResult?: {
    homeScore: number;
    awayScore: number;
    winner: 'home' | 'away' | 'draw';
  };
  createdAt: string;
  updatedAt: string;
}

interface MatchEvent {
  id?: string;
  type: 'goal' | 'yellow_card' | 'red_card' | 'substitution' | 'penalty';
  minute: number;
  second?: number;
  team: 'home' | 'away';
  playerName?: string;
  description: string;
}

interface MarketSetup {
  type: '1x2' | 'totals' | 'btts' | 'handicap' | 'correct_score';
  name: string;
  outcomes: {
    key: string;
    label: string;
    odds: number;
  }[];
  // Additional properties for specific market types
  line?: number; // For totals and handicap markets
  enabled?: boolean;
}

interface Sport {
  id: number;
  name: string;
  icon: string;
  endpoint: string;
}

interface League {
  id: string;
  name: string;
  sport: string;
  matches: Match[];
}

interface GroupedMatches {
  sport: Sport;
  leagues: League[];
  liveCount: number;
  upcomingCount: number;
}

interface MatchFilters {
  search: string;
  sport: string;
  status: 'all' | 'scheduled' | 'live' | 'finished' | 'cancelled' | 'postponed';
  source: 'all' | 'manual' | 'sportmonks';
  dateFrom: string;
  dateTo: string;
  league: string;
}

interface CreateMatchData {
  sport: string;
  leagueName: string;
  homeTeamName: string;
  awayTeamName: string;
  kickoffTime: string;
  markets: MarketSetup[];
  events: MatchEvent[];
  simulatedResult: {
    homeScore: number;
    awayScore: number;
    winner: 'home' | 'away' | 'draw';
  };
  defaultOdds: {
    home: number;
    draw: number;
    away: number;
  };
}

const MATCH_STATUS_COLORS = {
  scheduled: 'default',
  live: 'destructive', 
  finished: 'secondary',
  cancelled: 'outline',
  postponed: 'outline'
} as const;

const MATCH_STATUS_ICONS = {
  scheduled: Clock,
  live: PlayCircle,
  finished: CheckCircle,
  cancelled: XCircle,
  postponed: PauseCircle
} as const;

// Sport icon mapping
const getSportIcon = (sportName: string) => {
  const name = sportName.toLowerCase();
  switch (name) {
    case 'football':
      return SiFootballball;
    case 'hockey':
      return SiHockey;
    case 'tennis':
      return SiTennis;
    case 'basketball':
      return SiBasketball;
    case 'baseball':
      return SiBaseball;
    case 'volleyball':
      return SiVolleyball;
    case 'rugby':
      return SiRugby;
    default:
      return Globe;
  }
};

// Enhanced validation functions
const validateEventData = (eventData: Partial<MatchEvent>, existingEvents: MatchEvent[]): string | null => {
  if (!eventData.minute || eventData.minute < 1 || eventData.minute > 120) {
    return 'Minute must be between 1 and 120';
  }
  
  if (eventData.second && (eventData.second < 0 || eventData.second > 59)) {
    return 'Seconds must be between 0 and 59';
  }
  
  if (!eventData.type || !eventData.team || !eventData.description?.trim()) {
    return 'All required fields must be filled';
  }
  
  // Check for duplicate events at the same time
  const timeKey = `${eventData.minute}:${eventData.second || 0}`;
  const duplicateEvent = existingEvents.find(event => 
    `${event.minute}:${event.second || 0}` === timeKey && 
    event.type === eventData.type &&
    event.team === eventData.team
  );
  
  if (duplicateEvent) {
    return `A ${eventData.type} event for ${eventData.team} team already exists at ${timeKey}'`;
  }
  
  return null;
};

const validateMarketConfiguration = (markets: MarketSetup[]): string | null => {
  for (const market of markets) {
    if (!market.enabled) continue;
    
    // Check odds validation
    const invalidOdds = market.outcomes.some(outcome => 
      !outcome.odds || parseFloat(outcome.odds.toString()) < 1.01
    );
    
    if (invalidOdds) {
      return `${market.name}: All odds must be 1.01 or higher`;
    }
    
    // Check line requirements
    if ((market.type === 'totals' || market.type === 'handicap') && 
        (market.line === undefined || market.line === null)) {
      return `${market.name}: Line value is required for ${market.type} markets`;
    }
    
    // Validate totals line range
    if (market.type === 'totals' && market.line !== undefined && 
        (market.line < 0.5 || market.line > 10)) {
      return `${market.name}: Totals line must be between 0.5 and 10`;
    }
    
    // Validate handicap line range
    if (market.type === 'handicap' && market.line !== undefined && 
        (market.line < -5 || market.line > 5)) {
      return `${market.name}: Handicap line must be between -5 and +5`;
    }
  }
  
  return null;
};

const validateDefaultOdds = (defaultOdds: { home: number; draw: number; away: number; }): string | null => {
  if (defaultOdds.home < 1.01) return 'Home odds must be 1.01 or higher';
  if (defaultOdds.draw < 1.01) return 'Draw odds must be 1.01 or higher';
  if (defaultOdds.away < 1.01) return 'Away odds must be 1.01 or higher';
  return null;
};

// Add Event Form Component
function AddEventForm({ homeTeam, awayTeam, onAddEvent, existingEvents = [] }: {
  homeTeam: string;
  awayTeam: string;
  onAddEvent: (event: MatchEvent) => void;
  existingEvents?: MatchEvent[];
}) {
  const [eventData, setEventData] = useState<Partial<MatchEvent>>({
    type: 'goal',
    minute: 1,
    second: 0,
    team: 'home',
    playerName: '',
    description: ''
  });
  
  const [validationError, setValidationError] = useState<string | null>(null);
  
  const handleSubmit = () => {
    const error = validateEventData(eventData, existingEvents);
    
    if (error) {
      setValidationError(error);
      return;
    }
    
    if (eventData.minute && eventData.type && eventData.team && eventData.description) {
      onAddEvent({
        type: eventData.type as MatchEvent['type'],
        minute: eventData.minute,
        second: eventData.second || 0,
        team: eventData.team as 'home' | 'away',
        playerName: eventData.playerName,
        description: eventData.description.trim()
      });
      
      setValidationError(null);
      
      // Reset form
      setEventData({
        type: 'goal',
        minute: 1,
        second: 0,
        team: 'home',
        playerName: '',
        description: ''
      });
    }
  };
  
  // Clear validation error when form data changes
  const updateEventData = (updates: Partial<MatchEvent>) => {
    setEventData(prev => ({ ...prev, ...updates }));
    if (validationError) {
      setValidationError(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Event Type</Label>
          <Select
            value={eventData.type}
            onValueChange={(value) => updateEventData({ type: value as MatchEvent['type'] })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="goal">Goal</SelectItem>
              <SelectItem value="yellow_card">Yellow Card</SelectItem>
              <SelectItem value="red_card">Red Card</SelectItem>
              <SelectItem value="substitution">Substitution</SelectItem>
              <SelectItem value="penalty">Penalty</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div>
          <Label>Minute</Label>
          <Input
            type="number"
            min="1"
            max="120"
            value={eventData.minute}
            onChange={(e) => updateEventData({ minute: Math.min(120, Math.max(1, parseInt(e.target.value) || 1)) })}
            data-testid="input-event-minute"
          />
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Second (Optional)</Label>
          <Input
            type="number"
            min="0"
            max="59"
            value={eventData.second}
            onChange={(e) => updateEventData({ second: Math.min(59, Math.max(0, parseInt(e.target.value) || 0)) })}
            placeholder="0-59 seconds"
            data-testid="input-event-second"
          />
        </div>
        
        <div>
          <Label>Team</Label>
          <Select
            value={eventData.team}
            onValueChange={(value) => updateEventData({ team: value as 'home' | 'away' })}
          >
            <SelectTrigger data-testid="select-event-team">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="home">{homeTeam || 'Home Team'}</SelectItem>
              <SelectItem value="away">{awayTeam || 'Away Team'}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      
      <div>
        <Label>Player Name (Optional)</Label>
        <Input
          value={eventData.playerName}
          onChange={(e) => updateEventData({ playerName: e.target.value })}
          placeholder="Enter player name"
        />
      </div>
      
      <div>
        <Label>Event Description</Label>
        <Input
          value={eventData.description}
          onChange={(e) => updateEventData({ description: e.target.value })}
          placeholder={`e.g., ${eventData.playerName || 'Player'} scores a ${eventData.type === 'goal' ? 'goal' : eventData.type}`}
          data-testid="input-event-description"
        />
      </div>
      
      {validationError && (
        <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-700 dark:text-red-300">{validationError}</p>
        </div>
      )}
      
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Cancel</Button>
        </DialogClose>
        <DialogClose asChild disabled={!!validationError}>
          <Button 
            onClick={handleSubmit} 
            disabled={!eventData.minute || !eventData.description?.trim() || !!validationError}
            data-testid="button-submit-event"
          >
            Add Event
          </Button>
        </DialogClose>
      </DialogFooter>
    </div>
  );
}

export default function AdminMatchesMarkets() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { isAuthenticated, admin, refreshAdmin } = useAdminAuth();
  
  // State management
  const [filters, setFilters] = useState<MatchFilters>({
    search: '',
    sport: 'all',
    status: 'all',
    source: 'all',
    dateFrom: '',
    dateTo: '',
    league: ''
  });
  
  const [showFilters, setShowFilters] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSessionWarning, setShowSessionWarning] = useState(false);
  const [sessionTimeRemaining, setSessionTimeRemaining] = useState<number | null>(null);
  const [sessionCheckInterval, setSessionCheckInterval] = useState<NodeJS.Timeout | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [viewMode, setViewMode] = useState<'grouped' | 'table'>('grouped');
  const [expandedSports, setExpandedSports] = useState<Set<string>>(new Set());
  const [createStep, setCreateStep] = useState(1);
  
  // Create match form data
  const [createMatchData, setCreateMatchData] = useState<CreateMatchData>({
    sport: '',
    leagueName: '',
    homeTeamName: '',
    awayTeamName: '',
    kickoffTime: '',
    markets: [],
    events: [],
    simulatedResult: {
      homeScore: 0,
      awayScore: 0,
      winner: 'draw'
    },
    defaultOdds: {
      home: 2.50,
      draw: 3.20,
      away: 2.80
    }
  });

  // Additional markets state - now dynamic
  const [availableMarkets, setAvailableMarkets] = useState<MarketSetup[]>([]);
  
  // Session management utilities
  const checkSessionValidiy = async (): Promise<{ valid: boolean; remainingMs?: number; error?: string }> => {
    try {
      const adminAuthToken = localStorage.getItem('adminAuthToken');
      if (!adminAuthToken) {
        return { valid: false, error: 'No session token' };
      }
      
      const response = await adminApiRequest('GET', '/api/admin/auth/session-status');
      if (!response.ok) {
        if (response.status === 401) {
          return { valid: false, error: 'Session expired' };
        }
        return { valid: false, error: 'Session check failed' };
      }
      
      const data = await response.json();
      return {
        valid: true,
        remainingMs: data.data?.remainingMs || 0
      };
    } catch (error) {
      return { valid: false, error: 'Network error' };
    }
  };
  
  const handleSessionExpiry = () => {
    // Save current form data before clearing session
    const formDraftKey = 'admin-create-match-draft';
    localStorage.setItem(formDraftKey, JSON.stringify({
      createMatchData,
      availableMarkets,
      createStep,
      timestamp: Date.now()
    }));
    
    toast({
      title: "Session Expired",
      description: "Your admin session has expired. Your work has been saved as a draft. Please log in again.",
      variant: "destructive",
      duration: 10000
    });
    
    setShowCreateModal(false);
    setShowSessionWarning(false);
    setLocation('/prime-admin/login');
  };
  
  const extendSession = async () => {
    try {
      const response = await adminApiRequest('POST', '/api/admin/auth/extend-session');
      if (response.ok) {
        toast({
          title: "Session Extended",
          description: "Your session has been extended for another 8 hours.",
        });
        setShowSessionWarning(false);
        setSessionTimeRemaining(null);
      }
    } catch (error) {
      console.error('Failed to extend session:', error);
    }
  };
  
  const restoreFormData = () => {
    const formDraftKey = 'admin-create-match-draft';
    const savedData = localStorage.getItem(formDraftKey);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        // Only restore if saved within last 24 hours
        if (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
          setCreateMatchData(parsed.createMatchData || createMatchData);
          setAvailableMarkets(parsed.availableMarkets || []);
          setCreateStep(parsed.createStep || 1);
          
          toast({
            title: "Draft Restored",
            description: "Your previous work has been restored from draft.",
          });
        }
        localStorage.removeItem(formDraftKey);
      } catch (error) {
        console.error('Failed to restore form data:', error);
      }
    }
  };
  
  // Handicap formatting utilities
  const formatHandicapSign = (line: number): string => {
    if (line === 0) return '0';
    return line > 0 ? `+${line}` : line.toString();
  };
  
  const formatHandicapOppositeSign = (line: number): string => {
    if (line === 0) return '0';
    return line > 0 ? `-${line}` : `+${Math.abs(line)}`;
  };
  
  const formatHandicapName = (line: number): string => {
    return `Asian Handicap ${formatHandicapSign(line)}`;
  };
  
  const formatHandicapOutcomeLabel = (teamName: string, line: number, side: 'home' | 'away'): string => {
    const sign = side === 'home' ? formatHandicapSign(line) : formatHandicapOppositeSign(line);
    return `${teamName} (${sign})`;
  };
  
  // Market templates for adding new markets
  const marketTemplates = {
    totals: (line: number = 2.5) => ({
      type: 'totals' as const,
      name: `Total Goals Over/Under ${line}`,
      line,
      enabled: true,
      outcomes: [
        { key: 'over', label: `Over ${line}`, odds: 1.85 },
        { key: 'under', label: `Under ${line}`, odds: 1.95 }
      ]
    }),
    btts: () => ({
      type: 'btts' as const,
      name: 'Both Teams To Score',
      enabled: true,
      outcomes: [
        { key: 'yes', label: 'Yes', odds: 1.75 },
        { key: 'no', label: 'No', odds: 2.05 }
      ]
    }),
    handicap: (line: number = 0) => ({
      type: 'handicap' as const,
      name: formatHandicapName(line),
      line,
      enabled: true,
      outcomes: [
        { key: 'home', label: formatHandicapOutcomeLabel(createMatchData.homeTeamName || 'Home', line, 'home'), odds: 1.90 },
        { key: 'away', label: formatHandicapOutcomeLabel(createMatchData.awayTeamName || 'Away', line, 'away'), odds: 1.90 }
      ]
    })
  };
  
  // Function to add a new market
  const addMarket = (type: keyof typeof marketTemplates, line?: number) => {
    const newMarket = marketTemplates[type](line);
    setAvailableMarkets(prev => [...prev, newMarket]);
  };
  
  // Function to remove a market
  const removeMarket = (index: number) => {
    setAvailableMarkets(prev => prev.filter((_, i) => i !== index));
  };
  
  // Function to reset markets to default state
  const resetMarkets = () => {
    setAvailableMarkets([]);
  };
  
  // Auto-save form data to localStorage
  const saveFormDraft = () => {
    const formDraftKey = 'admin-create-match-draft';
    const draftData = {
      createMatchData,
      availableMarkets,
      createStep,
      timestamp: Date.now()
    };
    localStorage.setItem(formDraftKey, JSON.stringify(draftData));
  };
  
  // Auto-save form data whenever it changes
  useEffect(() => {
    if (showCreateModal) {
      const saveTimer = setTimeout(() => {
        saveFormDraft();
      }, 2000); // Auto-save after 2 seconds of inactivity
      
      return () => clearTimeout(saveTimer);
    }
  }, [createMatchData, availableMarkets, createStep, showCreateModal]);

  // Pagination
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    total: 0
  });

  // Sports data - mock data for now, can be replaced with API call
  const sportsData = [
    { id: 1, name: 'football', displayName: 'Football' },
    { id: 2, name: 'basketball', displayName: 'Basketball' },
    { id: 3, name: 'tennis', displayName: 'Tennis' },
    { id: 4, name: 'soccer', displayName: 'Soccer' },
    { id: 5, name: 'baseball', displayName: 'Baseball' },
    { id: 6, name: 'hockey', displayName: 'Hockey' },
    { id: 7, name: 'rugby', displayName: 'Rugby' },
    { id: 8, name: 'cricket', displayName: 'Cricket' }
  ];

  // Fetch sports from API
  const { data: sportsResponse } = useQuery({
    queryKey: ['/api/sports'],
    queryFn: async () => {
      const response = await adminApiRequest('GET', '/api/sports');
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const availableSports = sportsResponse?.data || sportsData;

  // Fetch matches with React Query
  const { data: matchesResponse, isLoading, error, refetch } = useQuery({
    queryKey: [
      '/api/admin/matches',
      pagination.page,
      pagination.limit,
      filters.search,
      filters.status,
      filters.source,
      filters.dateFrom,
      filters.dateTo,
      filters.league
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: pagination.limit.toString(),
        offset: ((pagination.page - 1) * pagination.limit).toString(),
      });

      if (filters.search) params.append('search', filters.search);
      if (filters.status !== 'all') params.append('status', filters.status);
      if (filters.source !== 'all') params.append('source', filters.source);
      if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.append('dateTo', filters.dateTo);
      if (filters.league) params.append('league', filters.league);

      const response = await adminApiRequest('GET', `/api/admin/matches?${params.toString()}`);
      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds for live matches
  });

  const matches = matchesResponse?.data?.matches || [];
  const totalMatches = matchesResponse?.data?.total || 0;

  // Update pagination total when data changes
  useEffect(() => {
    setPagination(prev => ({ ...prev, total: totalMatches }));
  }, [totalMatches]);
  
  // Session monitoring effect
  useEffect(() => {
    if (showCreateModal && isAuthenticated) {
      // Check session immediately when modal opens
      checkSessionValidiy().then(result => {
        if (!result.valid) {
          handleSessionExpiry();
          return;
        }
        
        // If less than 30 minutes remaining, show warning
        if (result.remainingMs && result.remainingMs < 30 * 60 * 1000) {
          setSessionTimeRemaining(result.remainingMs);
          setShowSessionWarning(true);
        }
      });
      
      // Set up periodic session checks every 5 minutes
      const interval = setInterval(async () => {
        const result = await checkSessionValidiy();
        if (!result.valid) {
          handleSessionExpiry();
          return;
        }
        
        if (result.remainingMs) {
          setSessionTimeRemaining(result.remainingMs);
          // Show warning if less than 30 minutes remaining
          if (result.remainingMs < 30 * 60 * 1000) {
            setShowSessionWarning(true);
          }
          // Auto-logout if less than 5 minutes
          if (result.remainingMs < 5 * 60 * 1000) {
            handleSessionExpiry();
          }
        }
      }, 5 * 60 * 1000); // Check every 5 minutes
      
      setSessionCheckInterval(interval);
      
      return () => {
        if (interval) {
          clearInterval(interval);
        }
      };
    }
  }, [showCreateModal, isAuthenticated]);
  
  // Restore form data on component mount
  useEffect(() => {
    if (isAuthenticated) {
      restoreFormData();
    }
  }, [isAuthenticated]);

  // Mutations
  const createMatchMutation = useMutation({
    mutationFn: async (data: CreateMatchData) => {
      try {
        const response = await adminApiRequest('POST', '/api/admin/matches', data);
        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('SESSION_EXPIRED');
          }
          if (response.status === 403) {
            throw new Error('ACCESS_DENIED');
          }
          throw new Error('Failed to create match');
        }
        return response.json();
      } catch (error: any) {
        if (error.message === 'CSRF_TOKEN_INVALID') {
          throw new Error('CSRF_TOKEN_INVALID');
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/matches'] });
      toast({
        title: "Success",
        description: "Match created successfully",
      });
      
      // Clear draft data on success
      localStorage.removeItem('admin-create-match-draft');
      
      setShowCreateModal(false);
      setCreateStep(1);
      setCreateMatchData({
        sport: '',
        leagueName: '',
        homeTeamName: '',
        awayTeamName: '',
        kickoffTime: '',
        markets: [],
        events: [],
        simulatedResult: {
          homeScore: 0,
          awayScore: 0,
          winner: 'draw'
        },
        defaultOdds: {
          home: 2.50,
          draw: 3.20,
          away: 2.80
        }
      });
      // Reset additional markets to empty state
      resetMarkets();
      
      // Clear session warning if any
      setShowSessionWarning(false);
      setSessionTimeRemaining(null);
    },
    onError: (error: any) => {
      if (error.message === 'SESSION_EXPIRED') {
        handleSessionExpiry();
        return;
      }
      
      if (error.message === 'ACCESS_DENIED') {
        toast({
          title: "Access Denied",
          description: "Your session has expired or you don't have permission to create matches. Please log in again.",
          variant: "destructive",
          duration: 8000
        });
        handleSessionExpiry();
        return;
      }
      
      if (error.message === 'CSRF_TOKEN_INVALID') {
        toast({
          title: "Security Token Expired",
          description: "Your security token has expired. Please try again or refresh the page.",
          variant: "destructive",
          duration: 8000
        });
        // Try to refresh CSRF token
        refreshAdmin();
        return;
      }
      
      // Generic error handling
      toast({
        title: "Error",
        description: error.message || "Failed to create match. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteMatchMutation = useMutation({
    mutationFn: async (matchId: string) => {
      const response = await adminApiRequest('DELETE', `/api/admin/matches/${matchId}`);
      if (!response.ok) {
        throw new Error('Failed to delete match');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/matches'] });
      toast({
        title: "Success",
        description: "Match deleted successfully",
      });
      setShowDeleteModal(false);
      setSelectedMatch(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to delete match",
        variant: "destructive",
      });
    },
  });

  const importSportMonksMutation = useMutation({
    mutationFn: async () => {
      const response = await adminApiRequest('POST', '/api/admin/matches/import-sportmonks');
      if (!response.ok) {
        throw new Error('Failed to import from SportMonks');
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/matches'] });
      toast({
        title: "Success",
        description: `Imported ${data.imported || 0} matches from SportMonks`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error", 
        description: "Failed to import from SportMonks",
        variant: "destructive",
      });
    },
  });

  // Helper functions
  const handleFilterChange = (key: keyof MatchFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const clearFilters = () => {
    setFilters({
      search: '',
      sport: 'all',
      status: 'all',
      source: 'all',
      dateFrom: '',
      dateTo: '',
      league: ''
    });
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const openMarketEditor = (match: Match) => {
    setLocation(`/prime-admin/matches/${match.id}/markets`);
  };

  const openDeleteModal = (match: Match) => {
    setSelectedMatch(match);
    setShowDeleteModal(true);
  };

  const formatMatchTime = (kickoffTime: string) => {
    try {
      return format(parseISO(kickoffTime), 'dd/MM/yyyy HH:mm');
    } catch {
      return 'Invalid date';
    }
  };

  const getStatusIcon = (status: string) => {
    const IconComponent = MATCH_STATUS_ICONS[status as keyof typeof MATCH_STATUS_ICONS] || Clock;
    return <IconComponent className="w-4 h-4" />;
  };

  // Group matches by sport and league
  const groupMatchesBySportAndLeague = (matches: Match[]): GroupedMatches[] => {
    const grouped = matches.reduce((acc, match) => {
      const sportKey = match.sport || 'Football';
      const leagueKey = match.leagueName;

      if (!acc[sportKey]) {
        const sport = availableSports.find((s: Sport) => s.name.toLowerCase() === sportKey.toLowerCase()) || 
                     { id: 0, name: sportKey, displayName: sportKey };
        acc[sportKey] = {
          sport,
          leagues: {},
          liveCount: 0,
          upcomingCount: 0
        };
      }

      if (!acc[sportKey].leagues[leagueKey]) {
        acc[sportKey].leagues[leagueKey] = {
          id: match.leagueId,
          name: leagueKey,
          sport: sportKey,
          matches: []
        };
      }

      acc[sportKey].leagues[leagueKey].matches.push(match);

      if (match.status === 'live') {
        acc[sportKey].liveCount++;
      } else if (match.status === 'scheduled') {
        acc[sportKey].upcomingCount++;
      }

      return acc;
    }, {} as Record<string, { sport: Sport; leagues: Record<string, League>; liveCount: number; upcomingCount: number; }>);

    return Object.values(grouped).map(item => ({
      ...item,
      leagues: Object.values(item.leagues)
    }));
  };

  const toggleSportExpansion = (sportName: string) => {
    setExpandedSports(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sportName)) {
        newSet.delete(sportName);
      } else {
        newSet.add(sportName);
      }
      return newSet;
    });
  };

  const totalPages = Math.ceil(totalMatches / pagination.limit);
  const groupedMatches = groupMatchesBySportAndLeague(matches);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3" data-testid="text-matches-title">
            <Globe className="w-8 h-8 text-primary" />
            Matches & Markets
          </h1>
          <p className="text-muted-foreground">
            Manage matches, markets, and betting options across all sports
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-muted rounded-lg p-1">
            <Button
              variant={viewMode === 'grouped' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grouped')}
              data-testid="button-grouped-view"
            >
              <Trophy className="w-4 h-4 mr-2" />
              Grouped
            </Button>
            <Button
              variant={viewMode === 'table' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('table')}
              data-testid="button-table-view"
            >
              <Target className="w-4 h-4 mr-2" />
              Table
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            data-testid="button-refresh-matches"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => importSportMonksMutation.mutate()}
            disabled={importSportMonksMutation.isPending}
            data-testid="button-import-sportmonks"
          >
            <Download className="w-4 h-4 mr-2" />
            Import SportMonks
          </Button>
          <Button
            onClick={async () => {
              // Validate session before opening modal
              const sessionResult = await checkSessionValidiy();
              if (!sessionResult.valid) {
                toast({
                  title: "Session Expired",
                  description: sessionResult.error || "Your admin session has expired. Please log in again.",
                  variant: "destructive",
                });
                setLocation('/prime-admin/login');
                return;
              }
              
              // Check if session is expiring soon
              if (sessionResult.remainingMs && sessionResult.remainingMs < 30 * 60 * 1000) {
                setSessionTimeRemaining(sessionResult.remainingMs);
                setShowSessionWarning(true);
              }
              
              setShowCreateModal(true);
            }}
            data-testid="button-create-match"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Match
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
                placeholder="Search by team names, league, or match ID..."
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                className="pl-10"
                data-testid="input-search-matches"
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div>
                  <Label htmlFor="sport-filter">Sport</Label>
                  <Select
                    value={filters.sport}
                    onValueChange={(value) => handleFilterChange('sport', value)}
                  >
                    <SelectTrigger id="sport-filter" data-testid="select-sport-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        <div className="flex items-center gap-2">
                          <Globe className="w-4 h-4" />
                          <span>All Sports</span>
                        </div>
                      </SelectItem>
                      {availableSports.map((sport: Sport) => {
                        const SportIcon = getSportIcon(sport.name);
                        return (
                          <SelectItem key={sport.id} value={sport.name.toLowerCase()}>
                            <div className="flex items-center gap-2">
                              <SportIcon className="w-4 h-4" />
                              <span>{sport.name}</span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

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
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="scheduled">Scheduled</SelectItem>
                      <SelectItem value="live">Live</SelectItem>
                      <SelectItem value="finished">Finished</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                      <SelectItem value="postponed">Postponed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="source-filter">Source</Label>
                  <Select
                    value={filters.source}
                    onValueChange={(value) => handleFilterChange('source', value)}
                  >
                    <SelectTrigger id="source-filter" data-testid="select-source-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sources</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                      <SelectItem value="sportmonks">SportMonks</SelectItem>
                    </SelectContent>
                  </Select>
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

      {/* Matches Display */}
      {viewMode === 'grouped' ? (
        /* Grouped View - Matches organized by Sport and League */
        <div className="space-y-6">
          {isLoading ? (
            <Card>
              <CardContent className="p-8">
                <div className="flex items-center justify-center">
                  <RefreshCw className="w-6 h-6 animate-spin mr-3" />
                  <span>Loading matches from all sports...</span>
                </div>
              </CardContent>
            </Card>
          ) : groupedMatches.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <AlertCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No matches found</h3>
                <p className="text-muted-foreground mb-4">
                  {Object.values(filters).some(v => v && v !== 'all') ? 
                    'No matches found matching your current filters.' : 
                    'No matches are currently available.'
                  }
                </p>
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create First Match
                </Button>
              </CardContent>
            </Card>
          ) : (
            groupedMatches.map((sportGroup) => (
              <Card key={sportGroup.sport.name} className="overflow-hidden">
                <CardHeader 
                  className="cursor-pointer hover-elevate transition-colors"
                  onClick={() => toggleSportExpansion(sportGroup.sport.name)}
                >
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {expandedSports.has(sportGroup.sport.name) ? 
                        <ChevronDown className="w-5 h-5" /> : 
                        <ChevronRight className="w-5 h-5" />
                      }
                      {(() => {
                        const SportIcon = getSportIcon(sportGroup.sport.name);
                        return <SportIcon className="w-6 h-6 text-primary" />;
                      })()}
                      <span className="text-xl">{sportGroup.sport.name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      {sportGroup.liveCount > 0 && (
                        <Badge variant="destructive" className="flex items-center gap-1">
                          <Zap className="w-3 h-3" />
                          {sportGroup.liveCount} Live
                        </Badge>
                      )}
                      {sportGroup.upcomingCount > 0 && (
                        <Badge variant="default" className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {sportGroup.upcomingCount} Upcoming
                        </Badge>
                      )}
                      <span className="text-muted-foreground">
                        {sportGroup.leagues.reduce((total, league) => total + league.matches.length, 0)} matches
                      </span>
                    </div>
                  </CardTitle>
                </CardHeader>
                
                <AnimatePresence>
                  {expandedSports.has(sportGroup.sport.name) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <CardContent className="pt-0">
                        <div className="space-y-6">
                          {sportGroup.leagues.map((league) => (
                            <div key={league.id} className="space-y-2">
                              <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg">
                                <Trophy className="w-4 h-4 text-primary" />
                                <span className="font-semibold">{league.name}</span>
                                <Badge variant="outline" className="ml-auto">
                                  {league.matches.length} matches
                                </Badge>
                              </div>
                              
                              <div className="grid gap-2">
                                {league.matches
                                  .sort((a, b) => {
                                    // Sort: live first, then by kickoff time
                                    if (a.status === 'live' && b.status !== 'live') return -1;
                                    if (b.status === 'live' && a.status !== 'live') return 1;
                                    return new Date(a.kickoffTime).getTime() - new Date(b.kickoffTime).getTime();
                                  })
                                  .map((match) => (
                                    <div
                                      key={match.id}
                                      className={`p-4 rounded-lg border hover-elevate transition-all ${
                                        match.status === 'live' ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950' :
                                        match.status === 'scheduled' ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950' :
                                        'border-muted bg-background'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                          <div className="flex items-center gap-3">
                                            <div className="font-semibold text-lg">
                                              {match.homeTeamName} vs {match.awayTeamName}
                                            </div>
                                            <Badge 
                                              variant={MATCH_STATUS_COLORS[match.status] as any}
                                              className="flex items-center gap-1"
                                            >
                                              {getStatusIcon(match.status)}
                                              {match.status.charAt(0).toUpperCase() + match.status.slice(1)}
                                            </Badge>
                                            {match.isManual && (
                                              <Badge variant="secondary">
                                                Manual
                                              </Badge>
                                            )}
                                          </div>
                                          
                                          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                                            <div className="flex items-center gap-1">
                                              <Calendar className="w-3 h-3" />
                                              {formatMatchTime(match.kickoffTime)}
                                            </div>
                                            {(match.status === 'finished' || match.status === 'live') && (
                                              <div className="flex items-center gap-1 font-mono font-bold">
                                                <span>Score:</span>
                                                <span>{match.homeScore} - {match.awayScore}</span>
                                              </div>
                                            )}
                                            <div className="flex items-center gap-1">
                                              <Target className="w-3 h-3" />
                                              {match.marketsCount} markets
                                            </div>
                                            <div className="flex items-center gap-1">
                                              <DollarSign className="w-3 h-3" />
                                              £{(match.totalExposure / 100).toLocaleString()} exposure
                                            </div>
                                          </div>
                                        </div>
                                        
                                        <div className="flex items-center gap-2">
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => openMarketEditor(match)}
                                            data-testid={`button-manage-markets-${match.id}`}
                                          >
                                            <Target className="w-4 h-4 mr-2" />
                                            Markets
                                          </Button>
                                          <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                              <Button variant="ghost" size="icon">
                                                <MoreHorizontal className="w-4 h-4" />
                                              </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                              <DropdownMenuItem onClick={() => setLocation(`/prime-admin/matches/${match.id}/exposure`)}>
                                                <Activity className="w-4 h-4 mr-2" />
                                                View Exposure
                                              </DropdownMenuItem>
                                              <DropdownMenuItem onClick={() => openDeleteModal(match)}>
                                                <Trash2 className="w-4 h-4 mr-2" />
                                                Delete Match
                                              </DropdownMenuItem>
                                            </DropdownMenuContent>
                                          </DropdownMenu>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            ))
          )}
        </div>
      ) : (
        /* Table View - Hierarchical table showing all matches in unified table format */
        <Card>
          <CardHeader>
            <CardTitle>Matches ({totalMatches.toLocaleString()})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sport</TableHead>
                    <TableHead>League</TableHead>
                    <TableHead>Match</TableHead>
                    <TableHead>Kickoff Time</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Odds Summary</TableHead>
                    <TableHead>Markets</TableHead>
                    <TableHead>Exposure</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, index) => (
                      <TableRow key={index}>
                        <TableCell colSpan={11} className="h-12">
                          <div className="flex items-center justify-center">
                            <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                            Loading matches...
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : matches.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center py-8">
                        <div className="text-muted-foreground">
                          {Object.values(filters).some(v => v && v !== 'all') ? 
                            'No matches found matching your filters' : 
                            'No matches found'
                          }
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    /* Render matches grouped by sport and league within unified table */
                    groupedMatches.flatMap((sportGroup) => 
                      sportGroup.leagues.flatMap((league) => [
                        /* Sport/League header row */
                        <TableRow key={`${sportGroup.sport.name}-${league.id}-header`} className="bg-muted/50 border-b-2">
                          <TableCell className="font-bold">
                            <div className="flex items-center gap-2">
                              {(() => {
                                const SportIcon = getSportIcon(sportGroup.sport.name);
                                return <SportIcon className="w-4 h-4 text-primary" />;
                              })()}
                              {sportGroup.sport.name}
                              {sportGroup.liveCount > 0 && (
                                <Badge variant="destructive" className="text-xs px-1 py-0 h-5 ml-2">
                                  {sportGroup.liveCount} LIVE
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="font-semibold">
                            <div className="flex items-center gap-2">
                              <Trophy className="w-4 h-4 text-primary" />
                              {league.name}
                              <Badge variant="outline" className="text-xs px-1 py-0 h-5 ml-2">
                                {league.matches.length}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell colSpan={9} className="text-sm text-muted-foreground italic">
                            {league.matches.length} matches in this league
                          </TableCell>
                        </TableRow>,
                        /* Match rows for this league */
                        ...league.matches.map((match: Match) => (
                          <TableRow 
                            key={match.id} 
                            className={`hover-elevate cursor-pointer border-l-4 ${ 
                              match.status === 'live' 
                                ? 'bg-red-50 dark:bg-red-950/20 border-l-red-500' 
                                : 'border-l-transparent'
                            }`}
                            onClick={() => openMarketEditor(match)}
                            data-testid={`row-match-${match.id}`}
                          >
                            <TableCell className="text-muted-foreground text-sm pl-6">
                              {/* Empty for better visual hierarchy - sport shown in header */}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm pl-6">
                              {/* Empty for better visual hierarchy - league shown in header */}
                            </TableCell>
                            <TableCell className="font-medium">
                              <div>
                                <div className="font-semibold flex items-center gap-2" data-testid={`text-match-${match.id}`}>
                                  {match.homeTeamName} vs {match.awayTeamName}
                                  {match.status === 'live' && (
                                    <Badge variant="destructive" className="text-xs px-1 py-0 h-5">
                                      LIVE
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  ID: {match.id.slice(-8)}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-muted-foreground" />
                                <span className="text-sm" data-testid={`text-kickoff-${match.id}`}>
                                  {formatMatchTime(match.kickoffTime)}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant={MATCH_STATUS_COLORS[match.status] as any}
                                className="flex items-center gap-1"
                                data-testid={`badge-status-${match.id}`}
                              >
                                {getStatusIcon(match.status)}
                                {match.status.charAt(0).toUpperCase() + match.status.slice(1)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {match.status === 'finished' || match.status === 'live' ? (
                                <span className="font-mono" data-testid={`text-score-${match.id}`}>
                                  {match.homeScore} - {match.awayScore}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openMarketEditor(match);
                                }}
                                className="text-xs"
                                data-testid={`button-odds-${match.id}`}
                              >
                                <TrendingUp className="w-3 h-3 mr-1" />
                                View Odds
                              </Button>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Target className="w-4 h-4 text-muted-foreground" />
                                <span data-testid={`text-markets-count-${match.id}`}>
                                  {match.marketsCount}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span 
                                className={`font-mono ${match.totalExposure > 100000 ? 'text-red-500' : 'text-green-500'}`}
                                data-testid={`text-exposure-${match.id}`}
                              >
                                £{(match.totalExposure / 100).toLocaleString()}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge variant={match.isManual ? 'default' : 'secondary'}>
                                {match.isManual ? 'Manual' : 'SportMonks'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {match.isManual ? (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button 
                                      variant="ghost" 
                                      size="icon"
                                      onClick={(e) => e.stopPropagation()}
                                      data-testid={`button-match-actions-${match.id}`}
                                    >
                                      <MoreHorizontal className="w-4 h-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={(e) => {
                                      e.stopPropagation();
                                      openMarketEditor(match);
                                    }}>
                                      <Target className="w-4 h-4 mr-2" />
                                      Manage Markets
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={(e) => {
                                      e.stopPropagation();
                                      toast({ title: 'Edit Match', description: 'Edit functionality coming soon' });
                                    }} data-testid={`action-edit-${match.id}`}>
                                      <Settings className="w-4 h-4 mr-2" />
                                      Edit Match
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={(e) => {
                                      e.stopPropagation();
                                      toast({ title: 'Override Match', description: 'Override functionality coming soon' });
                                    }} data-testid={`action-override-${match.id}`}>
                                      <AlertCircle className="w-4 h-4 mr-2" />
                                      Override Result
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={(e) => {
                                      e.stopPropagation();
                                      setLocation(`/prime-admin/matches/${match.id}/exposure`);
                                    }}>
                                      <Activity className="w-4 h-4 mr-2" />
                                      View Exposure
                                    </DropdownMenuItem>
                                    <DropdownMenuItem 
                                      className="text-red-600"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openDeleteModal(match);
                                      }}
                                      data-testid={`action-delete-${match.id}`}
                                    >
                                      <Trash2 className="w-4 h-4 mr-2" />
                                      Delete Match
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              ) : (
                                <div className="text-center text-xs text-muted-foreground" data-testid={`text-view-only-${match.id}`}>
                                  View Only
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      ])
                    )
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {Math.min((pagination.page - 1) * pagination.limit + 1, totalMatches)} to{' '}
            {Math.min(pagination.page * pagination.limit, totalMatches)} of {totalMatches} matches
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
              disabled={pagination.page === 1}
            >
              Previous
            </Button>
            <span className="text-sm">
              Page {pagination.page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
              disabled={pagination.page === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Enhanced Create Match Modal */}
      <Dialog open={showCreateModal} onOpenChange={(open) => {
        setShowCreateModal(open);
        if (!open) {
          setCreateStep(1);
          // Reset additional markets when modal is closed
          resetMarkets();
        }
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="modal-create-match">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5" />
              Create New Match
            </DialogTitle>
            <DialogDescription>
              Create a new match with comprehensive settings for any sport
            </DialogDescription>
            
            {/* Progress Indicator */}
            <div className="flex items-center gap-2 mt-4">
              {[1, 2, 3].map((step) => (
                <div key={step} className="flex items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                    createStep === step ? 'bg-primary text-primary-foreground' :
                    createStep > step ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {createStep > step ? <CheckCircle className="w-4 h-4" /> : step}
                  </div>
                  {step < 3 && (
                    <div className={`w-12 h-0.5 mx-2 transition-colors ${
                      createStep > step ? 'bg-green-400' : 'bg-muted'
                    }`} />
                  )}
                </div>
              ))}
            </div>
            
            <div className="text-sm text-muted-foreground">
              {createStep === 1 && 'Step 1: Basic Match Information'}
              {createStep === 2 && 'Step 2: Markets & Odds Configuration'}
              {createStep === 3 && 'Step 3: Match Simulation Settings'}
            </div>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Step 1: Basic Information */}
            {createStep === 1 && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="sport-select">Sport</Label>
                  <Select
                    value={createMatchData.sport}
                    onValueChange={(value) => setCreateMatchData(prev => ({ ...prev, sport: value }))}
                  >
                    <SelectTrigger id="sport-select" data-testid="select-create-sport">
                      <SelectValue placeholder="Choose a sport" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSports.map((sport: Sport) => {
                        const SportIcon = getSportIcon(sport.name);
                        return (
                          <SelectItem key={sport.id} value={sport.name.toLowerCase()}>
                            <div className="flex items-center gap-2">
                              <SportIcon className="w-4 h-4" />
                              <span>{sport.name}</span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="league-name">League Name</Label>
                  <Input
                    id="league-name"
                    value={createMatchData.leagueName}
                    onChange={(e) => setCreateMatchData(prev => ({ ...prev, leagueName: e.target.value }))}
                    placeholder="e.g., Premier League, NBA, ATP Tour"
                    data-testid="input-create-league"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="home-team">Home Team/Player</Label>
                    <Input
                      id="home-team"
                      value={createMatchData.homeTeamName}
                      onChange={(e) => setCreateMatchData(prev => ({ ...prev, homeTeamName: e.target.value }))}
                      placeholder="Home team or player"
                      data-testid="input-create-home-team"
                    />
                  </div>
                  <div>
                    <Label htmlFor="away-team">Away Team/Player</Label>
                    <Input
                      id="away-team"
                      value={createMatchData.awayTeamName}
                      onChange={(e) => setCreateMatchData(prev => ({ ...prev, awayTeamName: e.target.value }))}
                      placeholder="Away team or player"
                      data-testid="input-create-away-team"
                    />
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="kickoff-time">Match Start Time</Label>
                  <Input
                    id="kickoff-time"
                    type="datetime-local"
                    value={createMatchData.kickoffTime}
                    onChange={(e) => setCreateMatchData(prev => ({ ...prev, kickoffTime: e.target.value }))}
                    data-testid="input-create-kickoff"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Set the date and time when the match will begin
                  </p>
                </div>
              </div>
            )}
            
            {/* Step 2: Markets & Odds */}
            {createStep === 2 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Target className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold">Markets & Odds Configuration</h3>
                </div>
                
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="w-4 h-4" />
                    <span className="font-medium">Match Winner Market</span>
                    <Badge variant="default">Default</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Home Win Odds</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="1.01"
                        value={createMatchData.defaultOdds.home}
                        onChange={(e) => setCreateMatchData(prev => ({
                          ...prev,
                          defaultOdds: {
                            ...prev.defaultOdds,
                            home: parseFloat(e.target.value) || 1.01
                          }
                        }))}
                        className="mt-1"
                        data-testid="input-home-odds"
                      />
                    </div>
                    <div>
                      <Label>Draw Odds</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="1.01"
                        value={createMatchData.defaultOdds.draw}
                        onChange={(e) => setCreateMatchData(prev => ({
                          ...prev,
                          defaultOdds: {
                            ...prev.defaultOdds,
                            draw: parseFloat(e.target.value) || 1.01
                          }
                        }))}
                        className="mt-1"
                        data-testid="input-draw-odds"
                      />
                    </div>
                    <div>
                      <Label>Away Win Odds</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="1.01"
                        value={createMatchData.defaultOdds.away}
                        onChange={(e) => setCreateMatchData(prev => ({
                          ...prev,
                          defaultOdds: {
                            ...prev.defaultOdds,
                            away: parseFloat(e.target.value) || 1.01
                          }
                        }))}
                        className="mt-1"
                        data-testid="input-away-odds"
                      />
                    </div>
                  </div>
                </div>
                
                {/* Additional Markets Configuration */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" />
                      <span className="font-medium">Additional Markets</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" data-testid="button-add-market">
                            <Plus className="w-4 h-4 mr-2" />
                            Add Market
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => addMarket('totals', 1.5)}>
                            Over/Under 1.5 Goals
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => addMarket('totals', 2.5)}>
                            Over/Under 2.5 Goals
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => addMarket('totals', 3.5)}>
                            Over/Under 3.5 Goals
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => addMarket('btts')}>
                            Both Teams To Score
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => addMarket('handicap', -1)}>
                            Handicap -1
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => addMarket('handicap', 0)}>
                            Handicap 0
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => addMarket('handicap', 1)}>
                            Handicap +1
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  
                  {availableMarkets.length === 0 ? (
                    <div className="p-8 text-center border-2 border-dashed border-muted rounded-lg">
                      <Target className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                      <h3 className="text-lg font-medium mb-2">No Additional Markets</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Add markets like Over/Under Goals, Both Teams To Score, or Asian Handicap using the "Add Market" button above.
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Each market can be configured with custom odds and lines for comprehensive betting options.
                      </p>
                    </div>
                  ) : (
                    availableMarkets.map((market, index) => (
                    <div key={market.type} className={`p-4 rounded-lg border transition-all ${
                      market.enabled ? 'border-primary bg-primary/5' : 'border-muted bg-muted/20'
                    }`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={market.enabled}
                              onChange={(e) => {
                                const newMarkets = [...availableMarkets];
                                newMarkets[index].enabled = e.target.checked;
                                setAvailableMarkets(newMarkets);
                              }}
                              className="w-4 h-4"
                              data-testid={`checkbox-market-${market.type}-${index}`}
                            />
                            <span className="font-medium">{market.name}</span>
                          </label>
                        </div>
                        <div className="flex items-center gap-2">
                          {market.enabled && (
                            <Badge variant="default">Active</Badge>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeMarket(index)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            data-testid={`button-remove-market-${index}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      
                      {market.enabled && (
                        <div className="space-y-3">
                          {/* Line/Handicap input for totals and handicap markets */}
                          {(market.type === 'totals' || market.type === 'handicap') && (
                            <div>
                              <Label>{market.type === 'totals' ? 'Goal Line' : 'Handicap Line'}</Label>
                              <Input
                                type="number"
                                step={market.type === 'handicap' ? '0.25' : '0.5'}
                                value={market.line}
                                onChange={(e) => {
                                  const newMarkets = [...availableMarkets];
                                  const newLine = parseFloat(e.target.value) || 0;
                                  newMarkets[index].line = newLine;
                                  
                                  // Update outcome labels and market name based on line
                                  if (market.type === 'totals') {
                                    newMarkets[index].outcomes[0].label = `Over ${newLine}`;
                                    newMarkets[index].outcomes[1].label = `Under ${newLine}`;
                                    newMarkets[index].name = `Total Goals Over/Under ${newLine}`;
                                  } else if (market.type === 'handicap') {
                                    newMarkets[index].outcomes[0].label = formatHandicapOutcomeLabel(createMatchData.homeTeamName || 'Home', newLine, 'home');
                                    newMarkets[index].outcomes[1].label = formatHandicapOutcomeLabel(createMatchData.awayTeamName || 'Away', newLine, 'away');
                                    newMarkets[index].name = formatHandicapName(newLine);
                                  }
                                  
                                  setAvailableMarkets(newMarkets);
                                }}
                                className="mt-1"
                                data-testid={`input-line-${market.type}`}
                              />
                            </div>
                          )}
                          
                          {/* Odds inputs */}
                          <div className="grid grid-cols-2 gap-3">
                            {market.outcomes.map((outcome, outcomeIndex) => (
                              <div key={outcome.key}>
                                <Label>{outcome.label}</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="1.01"
                                  value={outcome.odds}
                                  onChange={(e) => {
                                    const newMarkets = [...availableMarkets];
                                    const odds = parseFloat(e.target.value);
                                    if (odds >= 1.01 || e.target.value === '') {
                                      newMarkets[index].outcomes[outcomeIndex].odds = odds || 1.01;
                                      setAvailableMarkets(newMarkets);
                                    }
                                  }}
                                  className="mt-1"
                                  data-testid={`input-odds-${market.type}-${outcome.key}`}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    ))
                  )}
                </div>
                
                <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                  <Info className="w-4 h-4 text-blue-500" />
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    Default markets will be created automatically. You can add more markets after match creation.
                  </p>
                </div>
              </div>
            )}
            
            {/* Step 3: Simulation Settings */}
            {createStep === 3 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Activity className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold">Match Simulation Settings</h3>
                </div>
                
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <Trophy className="w-4 h-4" />
                    <span className="font-medium">Predicted Result (for simulation)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Home Score</Label>
                      <Input
                        type="number"
                        min="0"
                        value={createMatchData.simulatedResult.homeScore}
                        onChange={(e) => setCreateMatchData(prev => ({
                          ...prev,
                          simulatedResult: {
                            ...prev.simulatedResult,
                            homeScore: parseInt(e.target.value) || 0
                          }
                        }))}
                        className="mt-1"
                        data-testid="input-home-score"
                      />
                    </div>
                    <div>
                      <Label>Away Score</Label>
                      <Input
                        type="number"
                        min="0"
                        value={createMatchData.simulatedResult.awayScore}
                        onChange={(e) => setCreateMatchData(prev => ({
                          ...prev,
                          simulatedResult: {
                            ...prev.simulatedResult,
                            awayScore: parseInt(e.target.value) || 0
                          }
                        }))}
                        className="mt-1"
                        data-testid="input-away-score"
                      />
                    </div>
                  </div>
                  
                  <div className="mt-3">
                    <Label>Match Winner</Label>
                    <Select
                      value={createMatchData.simulatedResult.winner}
                      onValueChange={(value: 'home' | 'away' | 'draw') => 
                        setCreateMatchData(prev => ({
                          ...prev,
                          simulatedResult: {
                            ...prev.simulatedResult,
                            winner: value
                          }
                        }))
                      }
                    >
                      <SelectTrigger className="mt-1" data-testid="select-winner">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="home">Home Team Win</SelectItem>
                        <SelectItem value="away">Away Team Win</SelectItem>
                        <SelectItem value="draw">Draw</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="p-4 border-2 border-dashed border-muted rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">Match Events (Goals, Cards, etc.)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => {
                          const minute = Math.max(1, Math.floor(Math.random() * 90) + 1);
                          const event = {
                            type: 'goal' as const,
                            minute,
                            team: 'home' as const,
                            playerName: '',
                            description: `Home team goal at ${minute}'`
                          };
                          setCreateMatchData(prev => ({
                            ...prev,
                            events: [...prev.events, event].sort((a, b) => a.minute - b.minute),
                            simulatedResult: {
                              ...prev.simulatedResult,
                              homeScore: prev.simulatedResult.homeScore + 1,
                              winner: prev.simulatedResult.homeScore + 1 > prev.simulatedResult.awayScore ? 'home' : 
                                     prev.simulatedResult.homeScore + 1 === prev.simulatedResult.awayScore ? 'draw' : prev.simulatedResult.winner
                            }
                          }));
                        }}
                        data-testid="button-quick-home-goal"
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Home Goal
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => {
                          const minute = Math.max(1, Math.floor(Math.random() * 90) + 1);
                          const event = {
                            type: 'goal' as const,
                            minute,
                            team: 'away' as const,
                            playerName: '',
                            description: `Away team goal at ${minute}'`
                          };
                          setCreateMatchData(prev => ({
                            ...prev,
                            events: [...prev.events, event].sort((a, b) => a.minute - b.minute),
                            simulatedResult: {
                              ...prev.simulatedResult,
                              awayScore: prev.simulatedResult.awayScore + 1,
                              winner: prev.simulatedResult.awayScore + 1 > prev.simulatedResult.homeScore ? 'away' : 
                                     prev.simulatedResult.awayScore + 1 === prev.simulatedResult.homeScore ? 'draw' : prev.simulatedResult.winner
                            }
                          }));
                        }}
                        data-testid="button-quick-away-goal"
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Away Goal
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Add specific match events with timing for realistic simulation. Quick buttons add random-timed goals and auto-update scores.
                  </p>
                  
                  {createMatchData.events.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {createMatchData.events
                        .sort((a, b) => {
                          if (a.minute !== b.minute) return a.minute - b.minute;
                          return (a.second || 0) - (b.second || 0);
                        })
                        .map((event, index) => {
                          const eventIcon = event.type === 'goal' ? '⚽' : 
                                          event.type === 'yellow_card' ? '🟨' : 
                                          event.type === 'red_card' ? '🟥' : 
                                          event.type === 'substitution' ? '🔄' : 
                                          event.type === 'penalty' ? '🥅' : '📝';
                          
                          return (
                            <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded border">
                              <div className="flex items-center gap-1">
                                <span className="text-sm">{eventIcon}</span>
                                <Badge variant="outline">
                                  {event.second && event.second > 0 ? 
                                    `${event.minute}:${event.second.toString().padStart(2, '0')}'` : 
                                    `${event.minute}'`
                                  }
                                </Badge>
                              </div>
                              <span className="text-sm flex-1">{event.description}</span>
                              <Badge variant={event.team === 'home' ? 'default' : 'secondary'}>
                                {event.team === 'home' ? createMatchData.homeTeamName || 'Home' : createMatchData.awayTeamName || 'Away'}
                              </Badge>
                              {event.playerName && (
                                <Badge variant="outline" className="text-xs">
                                  {event.playerName}
                                </Badge>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const isGoal = event.type === 'goal';
                                  setCreateMatchData(prev => {
                                    const newEvents = prev.events.filter((_, i) => i !== index);
                                    const newSimulatedResult = isGoal ? {
                                      ...prev.simulatedResult,
                                      homeScore: event.team === 'home' ? 
                                        Math.max(0, prev.simulatedResult.homeScore - 1) : 
                                        prev.simulatedResult.homeScore,
                                      awayScore: event.team === 'away' ? 
                                        Math.max(0, prev.simulatedResult.awayScore - 1) : 
                                        prev.simulatedResult.awayScore
                                    } : prev.simulatedResult;
                                    
                                    // Update winner based on new scores
                                    if (isGoal) {
                                      newSimulatedResult.winner = 
                                        newSimulatedResult.homeScore > newSimulatedResult.awayScore ? 'home' :
                                        newSimulatedResult.awayScore > newSimulatedResult.homeScore ? 'away' : 'draw';
                                    }
                                    
                                    return {
                                      ...prev,
                                      events: newEvents,
                                      simulatedResult: newSimulatedResult
                                    };
                                  });
                                }}
                                data-testid={`button-remove-event-${index}`}
                              >
                                <XCircle className="w-4 h-4" />
                              </Button>
                            </div>
                          );
                        })}
                    </div>
                  )}
                  
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" data-testid="button-add-event">
                        <Plus className="w-4 h-4 mr-2" />
                        Add Match Event
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Match Event</DialogTitle>
                        <DialogDescription>
                          Add events like goals, cards, or substitutions to simulate realistic match flow
                        </DialogDescription>
                      </DialogHeader>
                      <AddEventForm 
                        homeTeam={createMatchData.homeTeamName}
                        awayTeam={createMatchData.awayTeamName}
                        existingEvents={createMatchData.events}
                        onAddEvent={(event) => {
                          setCreateMatchData(prev => ({
                            ...prev,
                            events: [...prev.events, event].sort((a, b) => {
                              if (a.minute !== b.minute) return a.minute - b.minute;
                              return (a.second || 0) - (b.second || 0);
                            })
                          }));
                        }}
                      />
                    </DialogContent>
                  </Dialog>
                </div>
                
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <p className="text-sm text-green-700 dark:text-green-300">
                    These settings help create realistic live match simulations for testing betting scenarios.
                  </p>
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <div className="flex justify-between w-full">
              <div>
                {createStep > 1 && (
                  <Button
                    variant="outline"
                    onClick={() => setCreateStep(prev => prev - 1)}
                    data-testid="button-previous-step"
                  >
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    Previous
                  </Button>
                )}
              </div>
              
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowCreateModal(false)}
                  data-testid="button-cancel-create"
                >
                  Cancel
                </Button>
                
                {createStep < 3 ? (
                  <Button
                    onClick={() => {
                      // Validate and collect markets when moving from Step 2 to Step 3
                      if (createStep === 2) {
                        const enabledMarkets = availableMarkets.filter(market => market.enabled);
                        
                        // Validate markets
                        const marketError = validateMarketConfiguration(enabledMarkets);
                        if (marketError) {
                          toast({
                            title: "Validation Error",
                            description: marketError,
                            variant: "destructive"
                          });
                          return;
                        }
                        
                        // Validate default odds
                        const oddsError = validateDefaultOdds(createMatchData.defaultOdds);
                        if (oddsError) {
                          toast({
                            title: "Validation Error", 
                            description: oddsError,
                            variant: "destructive"
                          });
                          return;
                        }
                        
                        // Clean markets by removing client-only fields
                        const marketsToCreate = enabledMarkets.map(({enabled, ...market}) => ({
                          ...market,
                          outcomes: market.outcomes.map(outcome => ({
                            ...outcome,
                            odds: parseFloat(outcome.odds.toString()) || 1.01
                          }))
                        }));
                        
                        setCreateMatchData(prev => ({
                          ...prev,
                          markets: marketsToCreate
                        }));
                      }
                      
                      // Validate Step 1 data before proceeding
                      if (createStep === 1) {
                        const oddsError = validateDefaultOdds(createMatchData.defaultOdds);
                        if (oddsError) {
                          toast({
                            title: "Validation Error",
                            description: oddsError,
                            variant: "destructive"
                          });
                          return;
                        }
                      }
                      
                      setCreateStep(prev => prev + 1);
                    }}
                    disabled={
                      (createStep === 1 && (
                        !createMatchData.sport ||
                        !createMatchData.leagueName ||
                        !createMatchData.homeTeamName ||
                        !createMatchData.awayTeamName ||
                        !createMatchData.kickoffTime
                      )) || 
                      (createStep === 2 && (
                        // Check for validation errors in enabled markets and default odds
                        (() => {
                          const enabledMktCheck = availableMarkets.filter(m => m.enabled);
                          const marketError = validateMarketConfiguration(enabledMktCheck);
                          const oddsError = validateDefaultOdds(createMatchData.defaultOdds);
                          return !!(marketError || oddsError);
                        })()
                      ))
                    }
                    data-testid="button-next-step"
                  >
                    Next Step
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                ) : (
                  <Button
                    onClick={() => {
                      // Final validation before submission
                      const finalEnabledMarkets = availableMarkets.filter(market => market.enabled);
                      const marketError = validateMarketConfiguration(finalEnabledMarkets);
                      const oddsError = validateDefaultOdds(createMatchData.defaultOdds);
                      
                      if (marketError) {
                        toast({
                          title: "Validation Error",
                          description: marketError,
                          variant: "destructive"
                        });
                        return;
                      }
                      
                      if (oddsError) {
                        toast({
                          title: "Validation Error", 
                          description: oddsError,
                          variant: "destructive"
                        });
                        return;
                      }
                      
                      // Create default 1x2 market with user-provided odds
                      const defaultMarket: MarketSetup = {
                        type: '1x2',
                        name: 'Match Winner',
                        outcomes: [
                          { key: 'home', label: `${createMatchData.homeTeamName} Win`, odds: createMatchData.defaultOdds.home },
                          { key: 'draw', label: 'Draw', odds: createMatchData.defaultOdds.draw },
                          { key: 'away', label: `${createMatchData.awayTeamName} Win`, odds: createMatchData.defaultOdds.away }
                        ]
                      };
                      
                      // Collect and validate all enabled markets one final time
                      const enabledMarkets = availableMarkets.filter(market => market.enabled);
                      
                      // Validate markets before submitting
                      const invalidMarkets = enabledMarkets.filter(market => 
                        market.outcomes.some(outcome => !outcome.odds || parseFloat(outcome.odds.toString()) < 1.01) ||
                        ((market.type === 'totals' || market.type === 'handicap') && (market.line === undefined || market.line === null))
                      );
                      
                      if (invalidMarkets.length > 0) {
                        toast({
                          title: "Invalid Markets",
                          description: "Please check all odds are 1.01 or higher and lines are set for totals/handicap markets",
                          variant: "destructive"
                        });
                        return;
                      }
                      
                      // Clean markets by removing client-only fields
                      const marketsToCreate = enabledMarkets.map(({enabled, ...market}) => ({
                        ...market,
                        outcomes: market.outcomes.map(outcome => ({
                          ...outcome,
                          odds: parseFloat(outcome.odds.toString())
                        }))
                      }));
                      
                      createMatchMutation.mutate({
                        sport: createMatchData.sport,
                        leagueName: createMatchData.leagueName,
                        homeTeamName: createMatchData.homeTeamName,
                        awayTeamName: createMatchData.awayTeamName,
                        kickoffTime: createMatchData.kickoffTime,
                        markets: [defaultMarket, ...marketsToCreate],
                        events: createMatchData.events,
                        simulatedResult: createMatchData.simulatedResult,
                        defaultOdds: createMatchData.defaultOdds
                      });
                    }}
                    disabled={createMatchMutation.isPending}
                    data-testid="button-confirm-create-match"
                  >
                    {createMatchMutation.isPending ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Creating Match...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4 mr-2" />
                        Create Match
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Match Modal */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent data-testid="modal-delete-match">
          <DialogHeader>
            <DialogTitle>Delete Match</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this match? This action cannot be undone and will also delete all associated markets and bets.
            </DialogDescription>
          </DialogHeader>
          {selectedMatch && (
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="font-semibold">
                {selectedMatch.homeTeamName} vs {selectedMatch.awayTeamName}
              </div>
              <div className="text-sm text-muted-foreground">
                {selectedMatch.leagueName} • {formatMatchTime(selectedMatch.kickoffTime)}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteModal(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedMatch && deleteMatchMutation.mutate(selectedMatch.id)}
              disabled={deleteMatchMutation.isPending}
              data-testid="button-confirm-delete-match"
            >
              {deleteMatchMutation.isPending ? 'Deleting...' : 'Delete Match'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Session Warning Dialog */}
      <Dialog open={showSessionWarning} onOpenChange={setShowSessionWarning}>
        <DialogContent className="sm:max-w-md" data-testid="modal-session-warning">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Session Expiring Soon
            </DialogTitle>
            <DialogDescription>
              Your admin session will expire in {sessionTimeRemaining ? Math.ceil(sessionTimeRemaining / (60 * 1000)) : 0} minutes.
              Would you like to extend your session?
            </DialogDescription>
          </DialogHeader>
          
          <div className="p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-amber-600" />
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Your work will be automatically saved as a draft if the session expires.
              </p>
            </div>
          </div>
          
          <DialogFooter className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => {
                setShowSessionWarning(false);
                // Continue working with current session
              }}
              data-testid="button-continue-session"
            >
              Continue Working
            </Button>
            <Button
              onClick={extendSession}
              data-testid="button-extend-session"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Extend Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}