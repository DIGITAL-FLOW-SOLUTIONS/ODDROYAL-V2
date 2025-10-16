import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export function LiveMatchSkeleton() {
  return (
    <div className="w-full space-y-4 p-4">
      {/* Sports Carousel Skeleton */}
      <div className="flex gap-3 overflow-hidden">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="min-w-[140px] p-3">
            <Skeleton className="h-8 w-8 rounded-full mx-auto mb-2" />
            <Skeleton className="h-4 w-20 mx-auto mb-1" />
            <Skeleton className="h-3 w-16 mx-auto" />
          </Card>
        ))}
      </div>

      {/* Match Cards Skeleton */}
      {[1, 2, 3].map((i) => (
        <Card key={i} className="p-4">
          <div className="flex items-center justify-between mb-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-5 w-16" />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-8 w-16 mx-4" />
            <div className="flex gap-2">
              <Skeleton className="h-12 w-16" />
              <Skeleton className="h-12 w-16" />
              <Skeleton className="h-12 w-16" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

export function LineMatchSkeleton() {
  return (
    <div className="w-full space-y-6 pb-6">
      {/* Hero Banner Skeleton */}
      <div className="relative h-[300px] md:h-[400px] bg-gradient-to-br from-primary/20 to-primary/10">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center space-y-4">
            <Skeleton className="h-12 w-64 mx-auto" />
            <Skeleton className="h-6 w-96 mx-auto" />
            <Skeleton className="h-10 w-32 mx-auto" />
          </div>
        </div>
      </div>

      {/* Popular Events Skeleton */}
      <div className="container mx-auto px-4">
        <Skeleton className="h-8 w-48 mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="p-4">
              <Skeleton className="h-4 w-32 mb-3" />
              <div className="flex items-center justify-between mb-3">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-20" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-10 flex-1" />
                <Skeleton className="h-10 flex-1" />
                <Skeleton className="h-10 flex-1" />
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Matches Skeleton */}
      <div className="container mx-auto px-4">
        <Skeleton className="h-8 w-32 mb-4" />
        {[1, 2].map((i) => (
          <div key={i} className="mb-6">
            <Card className="mb-3">
              <div className="p-4 flex items-center justify-between">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-20" />
              </div>
            </Card>
            {[1, 2, 3].map((j) => (
              <Card key={j} className="p-4 mb-2">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <Skeleton className="h-4 w-32 mb-2" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <div className="flex gap-2">
                    <Skeleton className="h-12 w-16" />
                    <Skeleton className="h-12 w-16" />
                    <Skeleton className="h-12 w-16" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
