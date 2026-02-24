import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Ship,
  Plane,
  Truck,
  FileText,
  Package,
  ClipboardList,
  Building2,
  AlertCircle,
  Plus,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { Link } from "wouter";

import { AITriggerButton } from "@/components/FloatingAIAssistant";
export default function FreightDashboard() {
  const { data: stats, isLoading } = trpc.freight.dashboardStats.useQuery();
  const { data: recentRfqs } = trpc.freight.rfqs.list.useQuery({ status: undefined });
  const { data: recentBookings } = trpc.freight.bookings.list.useQuery({});
  const { data: pendingClearances } = trpc.customs.clearances.list.useQuery({ status: 'pending_documents' });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Freight & Logistics</h1>
          <p className="text-muted-foreground">Manage shipments, quotes, and customs clearance</p>
        </div>
        <div className="flex gap-2">
          <Link href="/freight/rfqs/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Quote Request
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between w-full">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Active RFQs
            </CardTitle>
            <AITriggerButton message="Analyze freight operations - optimize costs, predict delays, and monitor compliance" label="AI Freight Insights" />
          </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.activeRfqs || 0}</div>
            <p className="text-xs text-muted-foreground">Awaiting quotes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Pending Quotes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.pendingQuotes || 0}</div>
            <p className="text-xs text-muted-foreground">To review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Package className="h-4 w-4" />
              Active Bookings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.activeBookings || 0}</div>
            <p className="text-xs text-muted-foreground">In transit</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Pending Clearances
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.pendingClearances || 0}</div>
            <p className="text-xs text-muted-foreground">Need attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Active Carriers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalCarriers || 0}</div>
            <p className="text-xs text-muted-foreground">In network</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <Link href="/freight/rfqs">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-blue-600" />
                Quote Requests
              </CardTitle>
              <CardDescription>Create and manage freight RFQs</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">View all RFQs</span>
                <ArrowRight className="h-4 w-4" />
              </div>
            </CardContent>
          </Link>
        </Card>

        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <Link href="/freight/carriers">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="flex -space-x-1">
                  <Ship className="h-4 w-4 text-blue-600" />
                  <Plane className="h-4 w-4 text-blue-600" />
                  <Truck className="h-4 w-4 text-blue-600" />
                </div>
                Carriers & Forwarders
              </CardTitle>
              <CardDescription>Manage your carrier network</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">View all carriers</span>
                <ArrowRight className="h-4 w-4" />
              </div>
            </CardContent>
          </Link>
        </Card>

        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <Link href="/freight/customs">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-orange-600" />
                Customs Clearance
              </CardTitle>
              <CardDescription>Track import/export clearances</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">View clearances</span>
                <ArrowRight className="h-4 w-4" />
              </div>
            </CardContent>
          </Link>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent RFQs */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Quote Requests</CardTitle>
            <CardDescription>Latest freight RFQs</CardDescription>
          </CardHeader>
          <CardContent>
            {recentRfqs && recentRfqs.length > 0 ? (
              <div className="space-y-3">
                {recentRfqs.slice(0, 5).map((rfq) => (
                  <Link key={rfq.id} href={`/freight/rfqs/${rfq.id}`}>
                    <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors cursor-pointer">
                      <div>
                        <p className="font-medium">{rfq.rfqNumber}</p>
                        <p className="text-sm text-muted-foreground">{rfq.title}</p>
                      </div>
                      <Badge variant={
                        rfq.status === 'quotes_received' ? 'default' :
                        rfq.status === 'awarded' ? 'secondary' :
                        rfq.status === 'sent' ? 'outline' : 'secondary'
                      }>
                        {rfq.status.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <ClipboardList className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No quote requests yet</p>
                <Link href="/freight/rfqs/new">
                  <Button variant="link" className="mt-2">Create your first RFQ</Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active Bookings */}
        <Card>
          <CardHeader>
            <CardTitle>Active Bookings</CardTitle>
            <CardDescription>Shipments in progress</CardDescription>
          </CardHeader>
          <CardContent>
            {recentBookings && recentBookings.length > 0 ? (
              <div className="space-y-3">
                {recentBookings.slice(0, 5).map((booking) => (
                  <Link key={booking.id} href={`/freight/bookings/${booking.id}`}>
                    <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors cursor-pointer">
                      <div>
                        <p className="font-medium">{booking.bookingNumber}</p>
                        <p className="text-sm text-muted-foreground">
                          {booking.trackingNumber || 'No tracking yet'}
                        </p>
                      </div>
                      <Badge variant={
                        booking.status === 'in_transit' ? 'default' :
                        booking.status === 'delivered' ? 'secondary' :
                        booking.status === 'confirmed' ? 'outline' : 'secondary'
                      }>
                        {booking.status.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No active bookings</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
