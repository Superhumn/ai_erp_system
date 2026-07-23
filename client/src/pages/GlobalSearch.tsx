import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Users, Building2, Package, UserCog, FileSignature, FolderKanban, Loader2, Mic } from "lucide-react";
import { useLocation } from "wouter";

export default function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [, setLocation] = useLocation();

  const { data: results, isLoading } = trpc.dashboard.search.useQuery(
    { query },
    { enabled: query.length >= 2 }
  );

  const hasResults = results && (
    results.customers.length > 0 ||
    results.vendors.length > 0 ||
    results.products.length > 0 ||
    results.employees.length > 0 ||
    results.contracts.length > 0 ||
    results.projects.length > 0 ||
    (results as any).meetings?.length > 0
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <Search className="h-8 w-8" />
          Global Search
        </h1>
        <p className="text-muted-foreground mt-1">
          Search across all modules and entities.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search customers, vendors, products, employees, contracts, projects..."
          className="pl-10 h-12 text-lg"
          autoFocus
        />
      </div>

      {isLoading && query.length >= 2 && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {query.length >= 2 && !isLoading && !hasResults && (
        <div className="text-center py-12 text-muted-foreground">
          No results found for "{query}"
        </div>
      )}

      {hasResults && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {results.customers.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Customers ({results.customers.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {results.customers.map((customer) => (
                    <button
                      key={customer.id}
                      onClick={() => setLocation(`/sales/customers/${customer.id}`)}
                      className="w-full text-left p-2 rounded-md hover:bg-muted transition-colors"
                    >
                      <p className="font-medium text-sm">{customer.name}</p>
                      <p className="text-xs text-muted-foreground">{customer.email}</p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {results.vendors.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Vendors ({results.vendors.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {results.vendors.map((vendor) => (
                    <button
                      key={vendor.id}
                      onClick={() => setLocation('/operations/vendors')}
                      className="w-full text-left p-2 rounded-md hover:bg-muted transition-colors"
                    >
                      <p className="font-medium text-sm">{vendor.name}</p>
                      <p className="text-xs text-muted-foreground">{vendor.contactName}</p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {results.products.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Products ({results.products.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {results.products.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => setLocation(`/operations/products/${product.id}`)}
                      className="w-full text-left p-2 rounded-md hover:bg-muted transition-colors"
                    >
                      <p className="font-medium text-sm">{product.name}</p>
                      <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {results.employees.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <UserCog className="h-4 w-4" />
                  Employees ({results.employees.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {results.employees.map((employee) => (
                    <button
                      key={employee.id}
                      onClick={() => setLocation('/hr/employees')}
                      className="w-full text-left p-2 rounded-md hover:bg-muted transition-colors"
                    >
                      <p className="font-medium text-sm">{employee.firstName} {employee.lastName}</p>
                      <p className="text-xs text-muted-foreground">{employee.jobTitle}</p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {results.contracts.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <FileSignature className="h-4 w-4" />
                  Contracts ({results.contracts.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {results.contracts.map((contract) => (
                    <button
                      key={contract.id}
                      onClick={() => setLocation('/legal/contracts')}
                      className="w-full text-left p-2 rounded-md hover:bg-muted transition-colors"
                    >
                      <p className="font-medium text-sm">{contract.title}</p>
                      <p className="text-xs text-muted-foreground">{contract.contractNumber}</p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {results.projects.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <FolderKanban className="h-4 w-4" />
                  Projects ({results.projects.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {results.projects.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => setLocation('/projects')}
                      className="w-full text-left p-2 rounded-md hover:bg-muted transition-colors"
                    >
                      <p className="font-medium text-sm">{project.name}</p>
                      <p className="text-xs text-muted-foreground">{project.projectNumber}</p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          {(results as any).meetings?.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Mic className="h-4 w-4" />
                  Meetings ({(results as any).meetings.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {(results as any).meetings.map((meeting: any) => (
                    <button
                      key={meeting.id}
                      onClick={() => setLocation(`/meetings?meetingId=${meeting.id}`)}
                      className="w-full text-left p-2 rounded-md hover:bg-muted transition-colors"
                    >
                      <p className="font-medium text-sm">{meeting.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {meeting.date ? new Date(meeting.date).toLocaleDateString() : "—"}
                      </p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
