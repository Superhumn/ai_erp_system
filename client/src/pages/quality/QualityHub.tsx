import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Shield, AlertTriangle, Plus, Loader2, FileCheck, ClipboardList, FlaskConical, Search, GitBranch } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function QualityHub() {
  const { toast } = useToast();

  // Dialogs
  const [coaOpen, setCoaOpen] = useState(false);
  const [ncrOpen, setNcrOpen] = useState(false);
  const [capaOpen, setCapaOpen] = useState(false);
  const [labOpen, setLabOpen] = useState(false);

  // Traceability
  const [lotInput, setLotInput] = useState("");
  const [lotId, setLotId] = useState<number | null>(null);

  // COA form
  const [coaForm, setCoaForm] = useState({ coaNumber: "", type: "finished_product" as const, notes: "" });
  // NCR form
  const [ncrForm, setNcrForm] = useState({ ncrNumber: "", title: "", type: "incoming_material" as const, severity: "minor" as const, source: "internal_audit" as const, description: "" });
  // CAPA form
  const [capaForm, setCapaForm] = useState({ capaNumber: "", type: "corrective" as const, title: "", description: "", priority: "medium" as const });
  // Lab form
  const [labForm, setLabForm] = useState({ testNumber: "", testType: "microbiological" as const, testName: "", labName: "" });

  // Queries
  const coas = trpc.qualityManagement.coas.list.useQuery();
  const ncrs = trpc.qualityManagement.ncrs.list.useQuery();
  const capas = trpc.qualityManagement.capas.list.useQuery();
  const labTests = trpc.qualityManagement.labTests.list.useQuery();
  const traceForward = trpc.qualityManagement.traceability.traceForward.useQuery({ lotId: lotId! }, { enabled: !!lotId });
  const traceBackward = trpc.qualityManagement.traceability.traceBackward.useQuery({ lotId: lotId! }, { enabled: !!lotId });
  const customersByLot = trpc.qualityManagement.traceability.customersByLot.useQuery({ lotId: lotId! }, { enabled: !!lotId });

  // Mutations
  const createCoa = trpc.qualityManagement.coas.create.useMutation({
    onSuccess: () => { coas.refetch(); setCoaOpen(false); setCoaForm({ coaNumber: "", type: "finished_product", notes: "" }); toast({ title: "COA created" }); },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const createNcr = trpc.qualityManagement.ncrs.create.useMutation({
    onSuccess: () => { ncrs.refetch(); setNcrOpen(false); toast({ title: "NCR created" }); },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const createCapa = trpc.qualityManagement.capas.create.useMutation({
    onSuccess: () => { capas.refetch(); setCapaOpen(false); toast({ title: "CAPA created" }); },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const createLab = trpc.qualityManagement.labTests.create.useMutation({
    onSuccess: () => { labTests.refetch(); setLabOpen(false); toast({ title: "Lab test created" }); },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openNcrs = ncrs.data?.filter((n: any) => n.status === "open").length ?? 0;
  const pendingCoas = coas.data?.filter((c: any) => c.status === "pending_review").length ?? 0;
  const openCapas = capas.data?.filter((c: any) => c.status !== "closed").length ?? 0;
  const pendingLabs = labTests.data?.filter((l: any) => l.status === "pending").length ?? 0;

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      open: "destructive", approved: "default", closed: "secondary",
      pending_review: "outline", in_progress: "outline", completed: "default",
      draft: "secondary", active: "default",
    };
    return <Badge variant={(colors[status] ?? "outline") as any}>{status.replace(/_/g, " ")}</Badge>;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Shield className="h-7 w-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold">Quality Management</h1>
          <p className="text-sm text-muted-foreground">COAs, NCRs, CAPAs, Lab Testing &amp; Traceability</p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm text-muted-foreground">Open NCRs</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-red-600">{openNcrs}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm text-muted-foreground">COAs Pending Review</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-yellow-600">{pendingCoas}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm text-muted-foreground">Open CAPAs</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-orange-600">{openCapas}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm text-muted-foreground">Lab Tests Pending</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-blue-600">{pendingLabs}</p></CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="coas">
        <TabsList>
          <TabsTrigger value="coas"><FileCheck className="h-4 w-4 mr-1" />COAs</TabsTrigger>
          <TabsTrigger value="ncrs"><AlertTriangle className="h-4 w-4 mr-1" />NCRs</TabsTrigger>
          <TabsTrigger value="capas"><ClipboardList className="h-4 w-4 mr-1" />CAPAs</TabsTrigger>
          <TabsTrigger value="lab"><FlaskConical className="h-4 w-4 mr-1" />Lab Testing</TabsTrigger>
          <TabsTrigger value="trace"><GitBranch className="h-4 w-4 mr-1" />Traceability</TabsTrigger>
        </TabsList>

        {/* COAs Tab */}
        <TabsContent value="coas">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Certificates of Analysis</CardTitle>
              <Button size="sm" onClick={() => setCoaOpen(true)}><Plus className="h-4 w-4 mr-1" />New COA</Button>
            </CardHeader>
            <CardContent>
              {coas.isLoading ? <Loader2 className="animate-spin" /> : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4">COA #</th><th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Status</th><th className="py-2">Notes</th>
                  </tr></thead>
                  <tbody>{coas.data?.map((c: any) => (
                    <tr key={c.id} className="border-b hover:bg-muted/40">
                      <td className="py-2 pr-4 font-mono">{c.coaNumber}</td>
                      <td className="py-2 pr-4">{c.type.replace(/_/g, " ")}</td>
                      <td className="py-2 pr-4">{statusBadge(c.status)}</td>
                      <td className="py-2 text-muted-foreground truncate max-w-xs">{c.notes}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* NCRs Tab */}
        <TabsContent value="ncrs">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Non-Conformance Reports</CardTitle>
              <Button size="sm" onClick={() => setNcrOpen(true)}><Plus className="h-4 w-4 mr-1" />New NCR</Button>
            </CardHeader>
            <CardContent>
              {ncrs.isLoading ? <Loader2 className="animate-spin" /> : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4">NCR #</th><th className="py-2 pr-4">Title</th>
                    <th className="py-2 pr-4">Severity</th><th className="py-2">Status</th>
                  </tr></thead>
                  <tbody>{ncrs.data?.map((n: any) => (
                    <tr key={n.id} className="border-b hover:bg-muted/40">
                      <td className="py-2 pr-4 font-mono">{n.ncrNumber}</td>
                      <td className="py-2 pr-4">{n.title}</td>
                      <td className="py-2 pr-4">
                        <Badge variant={n.severity === "critical" ? "destructive" : n.severity === "major" ? "outline" : "secondary"}>
                          {n.severity}
                        </Badge>
                      </td>
                      <td className="py-2">{statusBadge(n.status)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* CAPAs Tab */}
        <TabsContent value="capas">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Corrective &amp; Preventive Actions</CardTitle>
              <Button size="sm" onClick={() => setCapaOpen(true)}><Plus className="h-4 w-4 mr-1" />New CAPA</Button>
            </CardHeader>
            <CardContent>
              {capas.isLoading ? <Loader2 className="animate-spin" /> : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4">CAPA #</th><th className="py-2 pr-4">Title</th>
                    <th className="py-2 pr-4">Type</th><th className="py-2 pr-4">Priority</th>
                    <th className="py-2">Status</th>
                  </tr></thead>
                  <tbody>{capas.data?.map((c: any) => (
                    <tr key={c.id} className="border-b hover:bg-muted/40">
                      <td className="py-2 pr-4 font-mono">{c.capaNumber}</td>
                      <td className="py-2 pr-4">{c.title}</td>
                      <td className="py-2 pr-4">{c.type}</td>
                      <td className="py-2 pr-4">
                        <Badge variant={c.priority === "critical" ? "destructive" : "outline"}>{c.priority}</Badge>
                      </td>
                      <td className="py-2">{statusBadge(c.status)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Lab Testing Tab */}
        <TabsContent value="lab">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Lab Testing Logs</CardTitle>
              <Button size="sm" onClick={() => setLabOpen(true)}><Plus className="h-4 w-4 mr-1" />New Test</Button>
            </CardHeader>
            <CardContent>
              {labTests.isLoading ? <Loader2 className="animate-spin" /> : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4">Test #</th><th className="py-2 pr-4">Test Name</th>
                    <th className="py-2 pr-4">Type</th><th className="py-2 pr-4">Lab</th>
                    <th className="py-2 pr-4">Passed</th><th className="py-2">Status</th>
                  </tr></thead>
                  <tbody>{labTests.data?.map((t: any) => (
                    <tr key={t.id} className="border-b hover:bg-muted/40">
                      <td className="py-2 pr-4 font-mono">{t.testNumber}</td>
                      <td className="py-2 pr-4">{t.testName}</td>
                      <td className="py-2 pr-4">{t.testType}</td>
                      <td className="py-2 pr-4">{t.labName}</td>
                      <td className="py-2 pr-4">
                        {t.passed === null ? "—" : t.passed
                          ? <Badge variant="default">Pass</Badge>
                          : <Badge variant="destructive">Fail</Badge>}
                      </td>
                      <td className="py-2">{statusBadge(t.status)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Traceability Tab */}
        <TabsContent value="trace">
          <Card>
            <CardHeader><CardTitle>Lot Traceability</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label>Lot ID</Label>
                  <Input
                    placeholder="Enter lot ID..."
                    value={lotInput}
                    onChange={(e) => setLotInput(e.target.value)}
                  />
                </div>
                <Button onClick={() => setLotId(Number(lotInput))} disabled={!lotInput}>
                  <Search className="h-4 w-4 mr-1" />Trace
                </Button>
              </div>

              {lotId && (
                <div className="grid lg:grid-cols-3 gap-4">
                  {/* Forward Trace */}
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Forward Trace (Destinations)</CardTitle></CardHeader>
                    <CardContent>
                      {traceForward.isLoading ? <Loader2 className="animate-spin h-4 w-4" /> : (
                        <ul className="space-y-1 text-sm">
                          {traceForward.data?.length === 0 && <li className="text-muted-foreground">No destination lots found</li>}
                          {traceForward.data?.map((link: any) => (
                            <li key={link.id} className="flex justify-between">
                              <span className="font-mono">Lot #{link.destinationLotId}</span>
                              <Badge variant="outline">{link.destinationType}</Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>

                  {/* Backward Trace */}
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Backward Trace (Sources)</CardTitle></CardHeader>
                    <CardContent>
                      {traceBackward.isLoading ? <Loader2 className="animate-spin h-4 w-4" /> : (
                        <ul className="space-y-1 text-sm">
                          {traceBackward.data?.length === 0 && <li className="text-muted-foreground">No source lots found</li>}
                          {traceBackward.data?.map((link: any) => (
                            <li key={link.id} className="flex justify-between">
                              <span className="font-mono">Lot #{link.sourceLotId}</span>
                              <Badge variant="outline">{link.sourceType}</Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>

                  {/* Customers */}
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Customers Received</CardTitle></CardHeader>
                    <CardContent>
                      {customersByLot.isLoading ? <Loader2 className="animate-spin h-4 w-4" /> : (
                        <ul className="space-y-1 text-sm">
                          {customersByLot.data?.length === 0 && <li className="text-muted-foreground">No shipments found</li>}
                          {customersByLot.data?.map((s: any) => (
                            <li key={s.id} className="flex justify-between">
                              <span>{s.customer?.name ?? `Customer #${s.customerId}`}</span>
                              <span className="text-muted-foreground">{s.quantityShipped} {s.quantityUnit}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* COA Create Dialog */}
      <Dialog open={coaOpen} onOpenChange={setCoaOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Certificate of Analysis</DialogTitle>
            <DialogDescription>Create a new COA record.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>COA Number</Label><Input value={coaForm.coaNumber} onChange={(e) => setCoaForm(f => ({ ...f, coaNumber: e.target.value }))} /></div>
            <div>
              <Label>Type</Label>
              <Select value={coaForm.type} onValueChange={(v) => setCoaForm(f => ({ ...f, type: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="incoming_raw_material">Incoming Raw Material</SelectItem>
                  <SelectItem value="in_process">In Process</SelectItem>
                  <SelectItem value="finished_product">Finished Product</SelectItem>
                  <SelectItem value="third_party">Third Party</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Notes</Label><Textarea value={coaForm.notes} onChange={(e) => setCoaForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCoaOpen(false)}>Cancel</Button>
            <Button onClick={() => createCoa.mutate(coaForm)} disabled={createCoa.isPending || !coaForm.coaNumber}>
              {createCoa.isPending && <Loader2 className="animate-spin h-4 w-4 mr-1" />}Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* NCR Create Dialog */}
      <Dialog open={ncrOpen} onOpenChange={setNcrOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Non-Conformance Report</DialogTitle>
            <DialogDescription>Document a quality non-conformance event.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>NCR Number</Label><Input value={ncrForm.ncrNumber} onChange={(e) => setNcrForm(f => ({ ...f, ncrNumber: e.target.value }))} /></div>
              <div>
                <Label>Severity</Label>
                <Select value={ncrForm.severity} onValueChange={(v) => setNcrForm(f => ({ ...f, severity: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="major">Major</SelectItem>
                    <SelectItem value="minor">Minor</SelectItem>
                    <SelectItem value="observation">Observation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Title</Label><Input value={ncrForm.title} onChange={(e) => setNcrForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div>
              <Label>Type</Label>
              <Select value={ncrForm.type} onValueChange={(v) => setNcrForm(f => ({ ...f, type: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="incoming_material">Incoming Material</SelectItem>
                  <SelectItem value="in_process">In Process</SelectItem>
                  <SelectItem value="finished_product">Finished Product</SelectItem>
                  <SelectItem value="customer_complaint">Customer Complaint</SelectItem>
                  <SelectItem value="audit_finding">Audit Finding</SelectItem>
                  <SelectItem value="environmental">Environmental</SelectItem>
                  <SelectItem value="equipment">Equipment</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Source</Label>
              <Select value={ncrForm.source} onValueChange={(v) => setNcrForm(f => ({ ...f, source: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal_audit">Internal Audit</SelectItem>
                  <SelectItem value="external_audit">External Audit</SelectItem>
                  <SelectItem value="customer_complaint">Customer Complaint</SelectItem>
                  <SelectItem value="supplier_issue">Supplier Issue</SelectItem>
                  <SelectItem value="process_deviation">Process Deviation</SelectItem>
                  <SelectItem value="lab_result">Lab Result</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Description</Label><Textarea value={ncrForm.description} onChange={(e) => setNcrForm(f => ({ ...f, description: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNcrOpen(false)}>Cancel</Button>
            <Button onClick={() => createNcr.mutate({ ...ncrForm, detectedDate: new Date().toISOString() })} disabled={createNcr.isPending || !ncrForm.ncrNumber || !ncrForm.title}>
              {createNcr.isPending && <Loader2 className="animate-spin h-4 w-4 mr-1" />}Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CAPA Create Dialog */}
      <Dialog open={capaOpen} onOpenChange={setCapaOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New CAPA</DialogTitle>
            <DialogDescription>Create a corrective or preventive action.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>CAPA Number</Label><Input value={capaForm.capaNumber} onChange={(e) => setCapaForm(f => ({ ...f, capaNumber: e.target.value }))} /></div>
              <div>
                <Label>Type</Label>
                <Select value={capaForm.type} onValueChange={(v) => setCapaForm(f => ({ ...f, type: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="corrective">Corrective</SelectItem>
                    <SelectItem value="preventive">Preventive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Title</Label><Input value={capaForm.title} onChange={(e) => setCapaForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div>
              <Label>Priority</Label>
              <Select value={capaForm.priority} onValueChange={(v) => setCapaForm(f => ({ ...f, priority: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Description</Label><Textarea value={capaForm.description} onChange={(e) => setCapaForm(f => ({ ...f, description: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCapaOpen(false)}>Cancel</Button>
            <Button onClick={() => createCapa.mutate(capaForm)} disabled={createCapa.isPending || !capaForm.capaNumber || !capaForm.title}>
              {createCapa.isPending && <Loader2 className="animate-spin h-4 w-4 mr-1" />}Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lab Test Create Dialog */}
      <Dialog open={labOpen} onOpenChange={setLabOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Lab Test</DialogTitle>
            <DialogDescription>Log a new laboratory test.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Test Number</Label><Input value={labForm.testNumber} onChange={(e) => setLabForm(f => ({ ...f, testNumber: e.target.value }))} /></div>
              <div>
                <Label>Test Type</Label>
                <Select value={labForm.testType} onValueChange={(v) => setLabForm(f => ({ ...f, testType: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="microbiological">Microbiological</SelectItem>
                    <SelectItem value="chemical">Chemical</SelectItem>
                    <SelectItem value="physical">Physical</SelectItem>
                    <SelectItem value="allergen">Allergen</SelectItem>
                    <SelectItem value="nutritional">Nutritional</SelectItem>
                    <SelectItem value="environmental">Environmental</SelectItem>
                    <SelectItem value="water">Water</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Test Name</Label><Input value={labForm.testName} onChange={(e) => setLabForm(f => ({ ...f, testName: e.target.value }))} /></div>
            <div><Label>Lab Name</Label><Input value={labForm.labName} onChange={(e) => setLabForm(f => ({ ...f, labName: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLabOpen(false)}>Cancel</Button>
            <Button onClick={() => createLab.mutate(labForm)} disabled={createLab.isPending || !labForm.testNumber || !labForm.testName}>
              {createLab.isPending && <Loader2 className="animate-spin h-4 w-4 mr-1" />}Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
