import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Plus, ClipboardCheck, FileCheck, FlaskConical, Eye } from "lucide-react";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  pass: "bg-green-500/10 text-green-500",
  fail: "bg-red-500/10 text-red-500",
  conditional_pass: "bg-yellow-500/10 text-yellow-500",
  pending: "bg-zinc-500/10 text-zinc-400",
  in_progress: "bg-blue-500/10 text-blue-400",
  on_hold: "bg-orange-500/10 text-orange-400",
  marginal: "bg-yellow-500/10 text-yellow-500",
  not_tested: "bg-zinc-500/10 text-zinc-400",
  draft: "bg-zinc-500/10 text-zinc-400",
  issued: "bg-green-500/10 text-green-500",
};

export default function QualityControl() {
  const [activeTab, setActiveTab] = useState("inspections");
  const [isCreateInspectionOpen, setIsCreateInspectionOpen] = useState(false);
  const [isCreateCoaOpen, setIsCreateCoaOpen] = useState(false);
  const [isAddResultsOpen, setIsAddResultsOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedInspectionId, setSelectedInspectionId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: products } = trpc.products.list.useQuery();
  const { data: customers } = trpc.customers.list.useQuery();
  const { data: vendors } = trpc.vendors.list.useQuery();

  const { data: inspections, refetch: refetchInspections } = trpc.qcInspections.list.useQuery(
    statusFilter !== "all" ? { status: statusFilter } : undefined
  );

  const { data: coas, refetch: refetchCoas } = trpc.coa.list.useQuery();

  const { data: inspectionDetail } = trpc.qcInspections.get.useQuery(
    { id: selectedInspectionId! },
    { enabled: !!selectedInspectionId }
  );

  // Inspection form
  const [inspForm, setInspForm] = useState({
    productId: 0,
    inspectionType: "incoming" as string,
    lotId: undefined as number | undefined,
    vendorId: undefined as number | undefined,
    purchaseOrderId: undefined as number | undefined,
    workOrderId: undefined as number | undefined,
    notes: "",
  });

  // COA form
  const [coaForm, setCoaForm] = useState({
    inspectionId: 0,
    productId: 0,
    lotId: undefined as number | undefined,
    customerId: undefined as number | undefined,
    issuedTo: "",
    lotCode: "",
    notes: "",
  });

  // Test results form
  const [testResults, setTestResults] = useState<Array<{
    testName: string; method: string; specMin: string; specMax: string;
    actualResult: string; unit: string; status: string; notes: string;
  }>>([{ testName: "", method: "", specMin: "", specMax: "", actualResult: "", unit: "", status: "pass", notes: "" }]);

  const createInspection = trpc.qcInspections.create.useMutation({
    onSuccess: () => { toast.success("Inspection created"); setIsCreateInspectionOpen(false); refetchInspections(); },
    onError: (e) => toast.error(e.message),
  });

  const updateInspection = trpc.qcInspections.update.useMutation({
    onSuccess: () => { toast.success("Inspection updated"); refetchInspections(); },
    onError: (e) => toast.error(e.message),
  });

  const addTestResults = trpc.qcInspections.addTestResults.useMutation({
    onSuccess: () => { toast.success("Test results added"); setIsAddResultsOpen(false); refetchInspections(); },
    onError: (e) => toast.error(e.message),
  });

  const createCoa = trpc.coa.create.useMutation({
    onSuccess: () => { toast.success("COA created"); setIsCreateCoaOpen(false); refetchCoas(); },
    onError: (e) => toast.error(e.message),
  });

  const updateCoa = trpc.coa.update.useMutation({
    onSuccess: () => { toast.success("COA updated"); refetchCoas(); },
    onError: (e) => toast.error(e.message),
  });

  const addResultRow = () => {
    setTestResults(p => [...p, { testName: "", method: "", specMin: "", specMax: "", actualResult: "", unit: "", status: "pass", notes: "" }]);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Quality Control & COA</h1>
        <p className="text-muted-foreground">Manage QC inspections, test results, and Certificates of Analysis</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="inspections"><ClipboardCheck className="h-4 w-4 mr-1" /> Inspections</TabsTrigger>
          <TabsTrigger value="coas"><FileCheck className="h-4 w-4 mr-1" /> COAs</TabsTrigger>
        </TabsList>

        {/* INSPECTIONS TAB */}
        <TabsContent value="inspections" className="space-y-4">
          <div className="flex justify-between items-center gap-4">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Filter by status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="pass">Pass</SelectItem>
                <SelectItem value="fail">Fail</SelectItem>
                <SelectItem value="on_hold">On Hold</SelectItem>
              </SelectContent>
            </Select>
            <Dialog open={isCreateInspectionOpen} onOpenChange={setIsCreateInspectionOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />New Inspection</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create QC Inspection</DialogTitle></DialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <Label>Product *</Label>
                    <Select value={inspForm.productId?.toString() || ""} onValueChange={v => setInspForm(p => ({ ...p, productId: Number(v) }))}>
                      <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                      <SelectContent>
                        {products?.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Inspection Type *</Label>
                    <Select value={inspForm.inspectionType} onValueChange={v => setInspForm(p => ({ ...p, inspectionType: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="incoming">Incoming (Raw Material)</SelectItem>
                        <SelectItem value="in_process">In-Process</SelectItem>
                        <SelectItem value="finished_goods">Finished Goods</SelectItem>
                        <SelectItem value="stability">Stability</SelectItem>
                        <SelectItem value="retest">Retest</SelectItem>
                        <SelectItem value="customer_complaint">Customer Complaint</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Vendor (for incoming)</Label>
                    <Select value={inspForm.vendorId?.toString() || "none"} onValueChange={v => setInspForm(p => ({ ...p, vendorId: v === "none" ? undefined : Number(v) }))}>
                      <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {vendors?.map(v => <SelectItem key={v.id} value={v.id.toString()}>{v.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Notes</Label>
                    <Textarea value={inspForm.notes} onChange={e => setInspForm(p => ({ ...p, notes: e.target.value }))} />
                  </div>
                </div>
                <Button onClick={() => { if (!inspForm.productId) { toast.error("Select a product"); return; } createInspection.mutate({ ...inspForm, inspectionType: inspForm.inspectionType as any }); }} disabled={createInspection.isPending}>
                  Create Inspection
                </Button>
              </DialogContent>
            </Dialog>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Inspection #</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Disposition</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inspections?.map(insp => (
                <TableRow key={insp.id}>
                  <TableCell className="font-mono text-sm">{insp.inspectionNumber}</TableCell>
                  <TableCell>{products?.find(p => p.id === insp.productId)?.name || insp.productId}</TableCell>
                  <TableCell className="capitalize">{insp.inspectionType.replace("_", " ")}</TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLORS[insp.status] || ""} variant="outline">{insp.status.replace("_", " ")}</Badge>
                  </TableCell>
                  <TableCell>{new Date(insp.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>{insp.disposition ? <Badge variant="outline" className="capitalize">{insp.disposition.replace("_", " ")}</Badge> : "—"}</TableCell>
                  <TableCell className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => { setSelectedInspectionId(insp.id); setIsDetailOpen(true); }}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { setSelectedInspectionId(insp.id); setIsAddResultsOpen(true); }}>
                      <FlaskConical className="h-4 w-4" />
                    </Button>
                    {insp.status === "pending" && (
                      <Button variant="ghost" size="sm" onClick={() => updateInspection.mutate({ id: insp.id, status: "in_progress" })}>
                        Start
                      </Button>
                    )}
                    {insp.status === "in_progress" && (
                      <>
                        <Button variant="ghost" size="sm" className="text-green-500" onClick={() => updateInspection.mutate({ id: insp.id, status: "pass", disposition: "accept" })}>
                          Pass
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-500" onClick={() => updateInspection.mutate({ id: insp.id, status: "fail", disposition: "reject" })}>
                          Fail
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {(!inspections || inspections.length === 0) && (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No inspections yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        {/* COAs TAB */}
        <TabsContent value="coas" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={isCreateCoaOpen} onOpenChange={setIsCreateCoaOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />Generate COA</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Generate Certificate of Analysis</DialogTitle></DialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <Label>From Inspection *</Label>
                    <Select value={coaForm.inspectionId?.toString() || ""} onValueChange={v => {
                      const insp = inspections?.find(i => i.id === Number(v));
                      setCoaForm(p => ({ ...p, inspectionId: Number(v), productId: insp?.productId || 0 }));
                    }}>
                      <SelectTrigger><SelectValue placeholder="Select passing inspection" /></SelectTrigger>
                      <SelectContent>
                        {inspections?.filter(i => ["pass", "conditional_pass"].includes(i.status)).map(i => (
                          <SelectItem key={i.id} value={i.id.toString()}>{i.inspectionNumber} — {products?.find(p => p.id === i.productId)?.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Issue To (Customer)</Label>
                    <Select value={coaForm.customerId?.toString() || "none"} onValueChange={v => {
                      const cust = customers?.find(c => c.id === Number(v));
                      setCoaForm(p => ({ ...p, customerId: v === "none" ? undefined : Number(v), issuedTo: cust?.name || "" }));
                    }}>
                      <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None (Generic)</SelectItem>
                        {customers?.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Lot Code</Label>
                    <Input value={coaForm.lotCode} onChange={e => setCoaForm(p => ({ ...p, lotCode: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Notes</Label>
                    <Textarea value={coaForm.notes} onChange={e => setCoaForm(p => ({ ...p, notes: e.target.value }))} />
                  </div>
                </div>
                <Button onClick={() => { if (!coaForm.inspectionId) { toast.error("Select an inspection"); return; } createCoa.mutate(coaForm); }} disabled={createCoa.isPending}>
                  Generate COA
                </Button>
              </DialogContent>
            </Dialog>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>COA #</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Lot Code</TableHead>
                <TableHead>Issued To</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Issued Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coas?.map(coa => (
                <TableRow key={coa.id}>
                  <TableCell className="font-mono text-sm">{coa.coaNumber}</TableCell>
                  <TableCell>{products?.find(p => p.id === coa.productId)?.name || coa.productId}</TableCell>
                  <TableCell>{coa.lotCode || "—"}</TableCell>
                  <TableCell>{coa.issuedTo || "—"}</TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLORS[coa.status] || ""} variant="outline">{coa.status}</Badge>
                  </TableCell>
                  <TableCell>{coa.issuedAt ? new Date(coa.issuedAt).toLocaleDateString() : "—"}</TableCell>
                  <TableCell>
                    {coa.status === "draft" && (
                      <Button variant="ghost" size="sm" onClick={() => updateCoa.mutate({ id: coa.id, status: "issued" })}>
                        Issue
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {(!coas || coas.length === 0) && (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No COAs generated yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>

      {/* Add Test Results Dialog */}
      <Dialog open={isAddResultsOpen} onOpenChange={setIsAddResultsOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Test Results</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {testResults.map((r, idx) => (
              <div key={idx} className="grid grid-cols-7 gap-2 items-end">
                <div>
                  <Label className="text-xs">Test Name</Label>
                  <Input value={r.testName} onChange={e => { const u = [...testResults]; u[idx].testName = e.target.value; setTestResults(u); }} placeholder="e.g. Moisture" />
                </div>
                <div>
                  <Label className="text-xs">Method</Label>
                  <Input value={r.method} onChange={e => { const u = [...testResults]; u[idx].method = e.target.value; setTestResults(u); }} placeholder="e.g. AOAC" />
                </div>
                <div>
                  <Label className="text-xs">Spec Min</Label>
                  <Input value={r.specMin} onChange={e => { const u = [...testResults]; u[idx].specMin = e.target.value; setTestResults(u); }} />
                </div>
                <div>
                  <Label className="text-xs">Spec Max</Label>
                  <Input value={r.specMax} onChange={e => { const u = [...testResults]; u[idx].specMax = e.target.value; setTestResults(u); }} />
                </div>
                <div>
                  <Label className="text-xs">Result</Label>
                  <Input value={r.actualResult} onChange={e => { const u = [...testResults]; u[idx].actualResult = e.target.value; setTestResults(u); }} />
                </div>
                <div>
                  <Label className="text-xs">Unit</Label>
                  <Input value={r.unit} onChange={e => { const u = [...testResults]; u[idx].unit = e.target.value; setTestResults(u); }} placeholder="%" />
                </div>
                <div>
                  <Label className="text-xs">Status</Label>
                  <Select value={r.status} onValueChange={v => { const u = [...testResults]; u[idx].status = v; setTestResults(u); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pass">Pass</SelectItem>
                      <SelectItem value="fail">Fail</SelectItem>
                      <SelectItem value="marginal">Marginal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addResultRow}><Plus className="h-3 w-3 mr-1" /> Add Row</Button>
          </div>
          <Button onClick={() => {
            const valid = testResults.filter(r => r.testName && r.actualResult);
            if (valid.length === 0) { toast.error("Add at least one test result"); return; }
            addTestResults.mutate({ inspectionId: selectedInspectionId!, results: valid.map(r => ({ ...r, status: r.status as any })) });
          }} disabled={addTestResults.isPending}>
            Save Test Results
          </Button>
        </DialogContent>
      </Dialog>

      {/* Inspection Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Inspection Details — {inspectionDetail?.inspectionNumber}</DialogTitle></DialogHeader>
          {inspectionDetail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Product:</span> {products?.find(p => p.id === inspectionDetail.productId)?.name}</div>
                <div><span className="text-muted-foreground">Type:</span> {inspectionDetail.inspectionType}</div>
                <div><span className="text-muted-foreground">Status:</span> <Badge className={STATUS_COLORS[inspectionDetail.status] || ""} variant="outline">{inspectionDetail.status}</Badge></div>
                <div><span className="text-muted-foreground">Disposition:</span> {inspectionDetail.disposition || "Pending"}</div>
              </div>
              {inspectionDetail.testResults && inspectionDetail.testResults.length > 0 && (
                <>
                  <h3 className="font-semibold">Test Results</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Test</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Spec Min</TableHead>
                        <TableHead>Spec Max</TableHead>
                        <TableHead>Result</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inspectionDetail.testResults.map(tr => (
                        <TableRow key={tr.id}>
                          <TableCell>{tr.testName}</TableCell>
                          <TableCell>{tr.method || "—"}</TableCell>
                          <TableCell>{tr.specMin || "—"}</TableCell>
                          <TableCell>{tr.specMax || "—"}</TableCell>
                          <TableCell className="font-mono">{tr.actualResult}</TableCell>
                          <TableCell>{tr.unit || "—"}</TableCell>
                          <TableCell><Badge className={STATUS_COLORS[tr.status] || ""} variant="outline">{tr.status}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
              {inspectionDetail.notes && (
                <div><span className="text-muted-foreground">Notes:</span> {inspectionDetail.notes}</div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
