import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, Users, DollarSign, Calendar, Target, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

export default function CRMDashboard() {
  const { data: investors, isLoading: investorsLoading } = trpc.crm.listInvestors.useQuery();
  const { data: campaigns, isLoading: campaignsLoading } = trpc.crm.listCampaigns.useQuery();
  const { data: investments, isLoading: investmentsLoading } = trpc.crm.listInvestments.useQuery();
  const { data: reminders, isLoading: remindersLoading } = trpc.crm.listReminders.useQuery({ 
    status: 'pending',
    dueBefore: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Next 30 days
  });

  const isLoading = investorsLoading || campaignsLoading || investmentsLoading;

  // Calculate metrics
  const totalInvestors = investors?.length || 0;
  const activeInvestors = investors?.filter((i: any) => i.status === 'invested').length || 0;
  const committedInvestors = investors?.filter((i: any) => i.status === 'committed').length || 0;
  const totalRaised = investments?.reduce((sum: any, inv: any) => sum + parseFloat(inv.amount || '0'), 0) || 0;
  const activeCampaigns = campaigns?.filter((c: any) => c.status === 'active').length || 0;
  const upcomingReminders = reminders?.filter((r: any) => {
    const dueDate = new Date(r.dueDate);
    const now = new Date();
    return dueDate > now && dueDate < new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  }).length || 0;

  // Status distribution for pie chart
  const statusData = [
    { name: 'Lead', value: investors?.filter((i: any) => i.status === 'lead').length || 0, color: '#9ca3af' },
    { name: 'Contacted', value: investors?.filter((i: any) => i.status === 'contacted').length || 0, color: '#3b82f6' },
    { name: 'Interested', value: investors?.filter((i: any) => i.status === 'interested').length || 0, color: '#8b5cf6' },
    { name: 'Committed', value: investors?.filter((i: any) => i.status === 'committed').length || 0, color: '#f59e0b' },
    { name: 'Invested', value: investors?.filter((i: any) => i.status === 'invested').length || 0, color: '#10b981' },
    { name: 'Passed', value: investors?.filter((i: any) => i.status === 'passed').length || 0, color: '#ef4444' },
  ].filter(item => item.value > 0);

  // Type distribution
  const typeData = [
    { name: 'Angel', value: investors?.filter((i: any) => i.type === 'angel').length || 0 },
    { name: 'VC', value: investors?.filter((i: any) => i.type === 'vc').length || 0 },
    { name: 'Family Office', value: investors?.filter((i: any) => i.type === 'family_office').length || 0 },
    { name: 'Strategic', value: investors?.filter((i: any) => i.type === 'strategic').length || 0 },
    { name: 'Accelerator', value: investors?.filter((i: any) => i.type === 'accelerator').length || 0 },
    { name: 'Other', value: investors?.filter((i: any) => i.type === 'other').length || 0 },
  ].filter(item => item.value > 0);

  // Campaign progress
  const campaignData = campaigns?.map((campaign: any) => ({
    name: campaign.name,
    target: parseFloat(campaign.targetAmount || '0'),
    raised: parseFloat(campaign.raisedAmount || '0'),
    percentage: (parseFloat(campaign.raisedAmount || '0') / parseFloat(campaign.targetAmount || '1')) * 100,
  })) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Fundraising CRM Dashboard</h1>
          <p className="text-muted-foreground">Overview of your fundraising pipeline and investor relationships</p>
        </div>
        <div className="flex gap-2">
          <Link href="/crm/investors">
            <Button variant="outline">
              <Users className="mr-2 h-4 w-4" />
              View All Investors
            </Button>
          </Link>
          <Link href="/crm/campaigns">
            <Button>
              <Target className="mr-2 h-4 w-4" />
              Campaigns
            </Button>
          </Link>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Investors</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalInvestors}</div>
            <p className="text-xs text-muted-foreground">
              {activeInvestors} active, {committedInvestors} committed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Raised</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalRaised.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              From {investments?.length || 0} investments
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Campaigns</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCampaigns}</div>
            <p className="text-xs text-muted-foreground">
              {campaigns?.length || 0} total campaigns
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Upcoming Follow-ups</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{upcomingReminders}</div>
            <p className="text-xs text-muted-foreground">
              In the next 7 days
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Investor Pipeline by Status</CardTitle>
            <CardDescription>Distribution of investors across the funnel</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Investor Types</CardTitle>
            <CardDescription>Breakdown by investor category</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={typeData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Campaign Progress */}
      {campaignData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Campaign Progress</CardTitle>
            <CardDescription>Fundraising progress by campaign</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {campaignData.map((campaign: any, index: any) => (
                <div key={index} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{campaign.name}</div>
                    <div className="text-sm text-muted-foreground">
                      ${campaign.raised.toLocaleString()} / ${campaign.target.toLocaleString()}
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-600 h-2 rounded-full"
                      style={{ width: `${Math.min(campaign.percentage, 100)}%` }}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {campaign.percentage.toFixed(1)}% of target
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity & Reminders */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Investors</CardTitle>
            <CardDescription>Latest additions to your pipeline</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {investors?.slice(0, 5).map((investor: any) => (
                <div key={investor.id} className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{investor.fullName}</div>
                    <div className="text-sm text-muted-foreground">
                      {investor.company} · {investor.type.replace('_', ' ')}
                    </div>
                  </div>
                  <Badge className={
                    investor.status === 'invested' ? 'bg-green-100 text-green-800' :
                    investor.status === 'committed' ? 'bg-orange-100 text-orange-800' :
                    'bg-blue-100 text-blue-800'
                  }>
                    {investor.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming Reminders</CardTitle>
            <CardDescription>Follow-ups due soon</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {reminders?.slice(0, 5).map((reminder: any) => {
                const investor = investors?.find((i: any) => i.id === reminder.investorId);
                return (
                  <div key={reminder.id} className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-medium">{reminder.title}</div>
                      <div className="text-sm text-muted-foreground">
                        {(investor as any)?.name || investor?.fullName} · Due {new Date(reminder.dueDate).toLocaleDateString()}
                      </div>
                    </div>
                    <Badge variant="outline" className={
                      reminder.priority === 'critical' ? 'border-red-500 text-red-700' :
                      reminder.priority === 'high' ? 'border-orange-500 text-orange-700' :
                      'border-blue-500 text-blue-700'
                    }>
                      {reminder.priority}
                    </Badge>
                  </div>
                );
              })}
              {(!reminders || reminders.length === 0) && (
                <div className="text-center py-4 text-muted-foreground">
                  <CheckCircle className="mx-auto h-8 w-8 mb-2" />
                  <p>No upcoming reminders</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
