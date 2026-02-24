import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  FileText, 
  Upload, 
  Package, 
  CheckCircle, 
  AlertCircle,
  Loader2,
  Building2,
  Truck,
  Scale,
  Box,
  FileCheck,
} from "lucide-react";
import { toast } from "sonner";

import { AITriggerButton } from "@/components/FloatingAIAssistant";
const documentTypes = [
  { value: "commercial_invoice", label: "Commercial Invoice", required: true, icon: FileText },
  { value: "packing_list", label: "Packing List", required: true, icon: Package },
  { value: "dimensions_weight", label: "Dimensions & Weight", required: true, icon: Scale },
  { value: "hs_codes", label: "HS Codes", required: true, icon: FileCheck },
  { value: "certificate_of_origin", label: "Certificate of Origin", required: false, icon: FileText },
  { value: "msds_sds", label: "MSDS/SDS", required: false, icon: AlertCircle },
  { value: "bill_of_lading", label: "Bill of Lading", required: false, icon: Truck },
  { value: "customs_declaration", label: "Customs Declaration", required: false, icon: FileText },
  { value: "other", label: "Other Document", required: false, icon: FileText },
];

export default function SupplierPortal() {
  const { token } = useParams<{ token: string }>();
  const [activeTab, setActiveTab] = useState("documents");
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  
  const [freightInfo, setFreightInfo] = useState({
    totalPackages: "",
    totalGrossWeight: "",
    totalNetWeight: "",
    weightUnit: "kg",
    totalVolume: "",
    volumeUnit: "cbm",
    preferredShipDate: "",
    preferredCarrier: "",
    incoterms: "FOB",
    specialInstructions: "",
    hasDangerousGoods: false,
    dangerousGoodsClass: "",
    unNumber: "",
  });
  
  const [packageDimensions, setPackageDimensions] = useState<Array<{
    length: string;
    width: string;
    height: string;
    weight: string;
    quantity: string;
  }>>([{ length: "", width: "", height: "", weight: "", quantity: "1" }]);
  
  const [hsCodes, setHsCodes] = useState<Array<{
    code: string;
    description: string;
  }>>([{ code: "", description: "" }]);

  // Queries
  const { data: session, isLoading: sessionLoading, error: sessionError } = trpc.supplierPortal.getSession.useQuery(
    { token: token || "" },
    { enabled: !!token }
  );
  
  const { data: documents, refetch: refetchDocuments } = trpc.supplierPortal.getDocuments.useQuery(
    { token: token || "" },
    { enabled: !!token && !!session }
  );
  
  const { data: existingFreightInfo } = trpc.supplierPortal.getFreightInfo.useQuery(
    { token: token || "" },
    { enabled: !!token && !!session }
  );

  // Mutations
  const uploadDocument = trpc.supplierPortal.uploadDocument.useMutation({
    onSuccess: () => {
      toast.success("Document uploaded successfully");
      setUploadingType(null);
      refetchDocuments();
    },
    onError: (e) => toast.error(e.message),
  });

  const saveFreightInfo = trpc.supplierPortal.saveFreightInfo.useMutation({
    onSuccess: () => {
      toast.success("Freight information saved");
    },
    onError: (e) => toast.error(e.message),
  });

  const completeSubmission = trpc.supplierPortal.completeSubmission.useMutation({
    onSuccess: () => {
      toast.success("All documents submitted successfully! Thank you.");
    },
    onError: (e) => toast.error(e.message),
  });

  // Load existing freight info
  useEffect(() => {
    if (existingFreightInfo) {
      setFreightInfo({
        totalPackages: existingFreightInfo.totalPackages?.toString() || "",
        totalGrossWeight: existingFreightInfo.totalGrossWeight || "",
        totalNetWeight: existingFreightInfo.totalNetWeight || "",
        weightUnit: existingFreightInfo.weightUnit || "kg",
        totalVolume: existingFreightInfo.totalVolume || "",
        volumeUnit: existingFreightInfo.volumeUnit || "cbm",
        preferredShipDate: existingFreightInfo.preferredShipDate ? new Date(existingFreightInfo.preferredShipDate).toISOString().split('T')[0] : "",
        preferredCarrier: existingFreightInfo.preferredCarrier || "",
        incoterms: existingFreightInfo.incoterms || "FOB",
        specialInstructions: existingFreightInfo.specialInstructions || "",
        hasDangerousGoods: existingFreightInfo.hasDangerousGoods || false,
        dangerousGoodsClass: existingFreightInfo.dangerousGoodsClass || "",
        unNumber: existingFreightInfo.unNumber || "",
      });
      if (existingFreightInfo.packageDimensions) {
        try {
          setPackageDimensions(JSON.parse(existingFreightInfo.packageDimensions));
        } catch {}
      }
      if (existingFreightInfo.hsCodes) {
        try {
          setHsCodes(JSON.parse(existingFreightInfo.hsCodes));
        } catch {}
      }
    }
  }, [existingFreightInfo]);

  const handleFileUpload = async (type: string, file: File) => {
    setUploadingType(type);
    
    // Convert file to base64
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
      uploadDocument.mutate({
        token: token || "",
        documentType: type,
        fileName: file.name,
        fileData: base64,
        mimeType: file.type,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSaveFreightInfo = () => {
    saveFreightInfo.mutate({
      token: token || "",
      ...freightInfo,
      totalPackages: parseInt(freightInfo.totalPackages) || undefined,
      preferredShipDate: freightInfo.preferredShipDate ? new Date(freightInfo.preferredShipDate) : undefined,
      packageDimensions: JSON.stringify(packageDimensions),
      hsCodes: JSON.stringify(hsCodes),
    });
  };

  const handleCompleteSubmission = () => {
    // Check required documents
    const uploadedTypes = documents?.map((d: any) => d.documentType) || [];
    const missingRequired = documentTypes
      .filter(dt => dt.required && !uploadedTypes.includes(dt.value))
      .map(dt => dt.label);
    
    if (missingRequired.length > 0) {
      toast.error(`Please upload required documents: ${missingRequired.join(", ")}`);
      return;
    }
    
    completeSubmission.mutate({ token: token || "" });
  };

  const addPackageDimension = () => {
    setPackageDimensions([...packageDimensions, { length: "", width: "", height: "", weight: "", quantity: "1" }]);
  };

  const addHsCode = () => {
    setHsCodes([...hsCodes, { code: "", description: "" }]);
  };

  if (sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (sessionError || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="max-w-md">
          <CardHeader>
            <div className="flex items-center justify-between w-full">
              <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-6 w-6" />
              Invalid or Expired Link
            </CardTitle>
            <CardDescription>
              This supplier portal link is invalid or has expired. Please contact the buyer for a new link.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (session.status === "completed") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-6 w-6" />
              Submission Complete
            </CardTitle>
            <CardDescription>
              Thank you! All documents have been submitted for PO #{session.purchaseOrder?.poNumber}. 
              The buyer will review your submission and contact you if any additional information is needed.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const uploadedTypes = documents?.map((d: any) => d.documentType) || [];
  const requiredComplete = documentTypes.filter(dt => dt.required).every(dt => uploadedTypes.includes(dt.value));

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Building2 className="h-8 w-8 text-blue-600" />
            <h1 className="text-2xl font-bold">Supplier Document Portal</h1>
          </div>
          <p className="text-muted-foreground">
            Upload required shipping and customs documentation for Purchase Order <strong>#{session.purchaseOrder?.poNumber}</strong>
          </p>
        </div>

        {/* PO Summary */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Order Summary</CardTitle>
            <AITriggerButton message="Analyze supplier metrics - show performance trends and collaborative forecasting insights" label="AI Supplier Insights" />
          </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">PO Number:</span>
                <p className="font-medium">{session.purchaseOrder?.poNumber}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Expected Date:</span>
                <p className="font-medium">
                  {session.purchaseOrder?.expectedDate 
                    ? new Date(session.purchaseOrder.expectedDate).toLocaleDateString() 
                    : "TBD"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Total Amount:</span>
                <p className="font-medium">${session.purchaseOrder?.totalAmount}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>
                <Badge variant="outline">{session.purchaseOrder?.status}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="documents" className="gap-2">
              <FileText className="h-4 w-4" />
              Documents
            </TabsTrigger>
            <TabsTrigger value="freight" className="gap-2">
              <Truck className="h-4 w-4" />
              Freight Info
            </TabsTrigger>
          </TabsList>

          <TabsContent value="documents" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Required Documents</CardTitle>
                <CardDescription>
                  Upload the following documents. Items marked with * are required.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {documentTypes.map((docType) => {
                  const uploaded = documents?.find((d: any) => d.documentType === docType.value);
                  const Icon = docType.icon;
                  
                  return (
                    <div 
                      key={docType.value}
                      className={`flex items-center justify-between p-4 rounded-lg border ${
                        uploaded ? "bg-green-50 border-green-200" : "bg-white"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={`h-5 w-5 ${uploaded ? "text-green-600" : "text-gray-400"}`} />
                        <div>
                          <p className="font-medium">
                            {docType.label}
                            {docType.required && <span className="text-red-500 ml-1">*</span>}
                          </p>
                          {uploaded && (
                            <p className="text-sm text-green-600">{uploaded.fileName}</p>
                          )}
                        </div>
                      </div>
                      <div>
                        {uploaded ? (
                          <Badge variant="outline" className="bg-green-100 text-green-700">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Uploaded
                          </Badge>
                        ) : (
                          <div className="relative">
                            <input
                              type="file"
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleFileUpload(docType.value, file);
                              }}
                              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                            />
                            <Button 
                              variant="outline" 
                              size="sm"
                              disabled={uploadingType === docType.value}
                            >
                              {uploadingType === docType.value ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <Upload className="h-4 w-4 mr-2" />
                                  Upload
                                </>
                              )}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="freight" className="mt-6 space-y-6">
            {/* Shipment Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Shipment Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>Total Packages</Label>
                    <Input
                      type="number"
                      value={freightInfo.totalPackages}
                      onChange={(e) => setFreightInfo({ ...freightInfo, totalPackages: e.target.value })}
                      placeholder="e.g., 10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Gross Weight</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        value={freightInfo.totalGrossWeight}
                        onChange={(e) => setFreightInfo({ ...freightInfo, totalGrossWeight: e.target.value })}
                        placeholder="e.g., 500"
                      />
                      <Select value={freightInfo.weightUnit} onValueChange={(v) => setFreightInfo({ ...freightInfo, weightUnit: v })}>
                        <SelectTrigger className="w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="kg">kg</SelectItem>
                          <SelectItem value="lb">lb</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Net Weight</Label>
                    <Input
                      type="number"
                      value={freightInfo.totalNetWeight}
                      onChange={(e) => setFreightInfo({ ...freightInfo, totalNetWeight: e.target.value })}
                      placeholder="e.g., 450"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Total Volume</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        value={freightInfo.totalVolume}
                        onChange={(e) => setFreightInfo({ ...freightInfo, totalVolume: e.target.value })}
                        placeholder="e.g., 2.5"
                      />
                      <Select value={freightInfo.volumeUnit} onValueChange={(v) => setFreightInfo({ ...freightInfo, volumeUnit: v })}>
                        <SelectTrigger className="w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cbm">CBM</SelectItem>
                          <SelectItem value="cft">CFT</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Package Dimensions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Box className="h-5 w-5" />
                  Package Dimensions
                </CardTitle>
                <CardDescription>Enter dimensions for each package type (in cm)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {packageDimensions.map((pkg, index) => (
                  <div key={index} className="grid grid-cols-5 gap-2">
                    <Input
                      placeholder="Length"
                      value={pkg.length}
                      onChange={(e) => {
                        const newDims = [...packageDimensions];
                        newDims[index].length = e.target.value;
                        setPackageDimensions(newDims);
                      }}
                    />
                    <Input
                      placeholder="Width"
                      value={pkg.width}
                      onChange={(e) => {
                        const newDims = [...packageDimensions];
                        newDims[index].width = e.target.value;
                        setPackageDimensions(newDims);
                      }}
                    />
                    <Input
                      placeholder="Height"
                      value={pkg.height}
                      onChange={(e) => {
                        const newDims = [...packageDimensions];
                        newDims[index].height = e.target.value;
                        setPackageDimensions(newDims);
                      }}
                    />
                    <Input
                      placeholder="Weight (kg)"
                      value={pkg.weight}
                      onChange={(e) => {
                        const newDims = [...packageDimensions];
                        newDims[index].weight = e.target.value;
                        setPackageDimensions(newDims);
                      }}
                    />
                    <Input
                      placeholder="Qty"
                      value={pkg.quantity}
                      onChange={(e) => {
                        const newDims = [...packageDimensions];
                        newDims[index].quantity = e.target.value;
                        setPackageDimensions(newDims);
                      }}
                    />
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addPackageDimension}>
                  + Add Package Type
                </Button>
              </CardContent>
            </Card>

            {/* HS Codes */}
            <Card>
              <CardHeader>
                <CardTitle>HS Codes</CardTitle>
                <CardDescription>Enter HS codes for all products in this shipment</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {hsCodes.map((hs, index) => (
                  <div key={index} className="grid grid-cols-3 gap-2">
                    <Input
                      placeholder="HS Code (e.g., 8471.30)"
                      value={hs.code}
                      onChange={(e) => {
                        const newCodes = [...hsCodes];
                        newCodes[index].code = e.target.value;
                        setHsCodes(newCodes);
                      }}
                    />
                    <Input
                      className="col-span-2"
                      placeholder="Product Description"
                      value={hs.description}
                      onChange={(e) => {
                        const newCodes = [...hsCodes];
                        newCodes[index].description = e.target.value;
                        setHsCodes(newCodes);
                      }}
                    />
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addHsCode}>
                  + Add HS Code
                </Button>
              </CardContent>
            </Card>

            {/* Shipping Preferences */}
            <Card>
              <CardHeader>
                <CardTitle>Shipping Preferences</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Preferred Ship Date</Label>
                    <Input
                      type="date"
                      value={freightInfo.preferredShipDate}
                      onChange={(e) => setFreightInfo({ ...freightInfo, preferredShipDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Preferred Carrier</Label>
                    <Input
                      value={freightInfo.preferredCarrier}
                      onChange={(e) => setFreightInfo({ ...freightInfo, preferredCarrier: e.target.value })}
                      placeholder="e.g., DHL, FedEx"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Incoterms</Label>
                    <Select value={freightInfo.incoterms} onValueChange={(v) => setFreightInfo({ ...freightInfo, incoterms: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EXW">EXW - Ex Works</SelectItem>
                        <SelectItem value="FOB">FOB - Free on Board</SelectItem>
                        <SelectItem value="CIF">CIF - Cost, Insurance & Freight</SelectItem>
                        <SelectItem value="DDP">DDP - Delivered Duty Paid</SelectItem>
                        <SelectItem value="DAP">DAP - Delivered at Place</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Special Instructions</Label>
                  <Textarea
                    value={freightInfo.specialInstructions}
                    onChange={(e) => setFreightInfo({ ...freightInfo, specialInstructions: e.target.value })}
                    placeholder="Any special handling or shipping instructions..."
                    rows={3}
                  />
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={freightInfo.hasDangerousGoods}
                      onChange={(e) => setFreightInfo({ ...freightInfo, hasDangerousGoods: e.target.checked })}
                      className="rounded"
                    />
                    Contains Dangerous Goods
                  </label>
                  {freightInfo.hasDangerousGoods && (
                    <>
                      <Input
                        className="w-32"
                        placeholder="DG Class"
                        value={freightInfo.dangerousGoodsClass}
                        onChange={(e) => setFreightInfo({ ...freightInfo, dangerousGoodsClass: e.target.value })}
                      />
                      <Input
                        className="w-32"
                        placeholder="UN Number"
                        value={freightInfo.unNumber}
                        onChange={(e) => setFreightInfo({ ...freightInfo, unNumber: e.target.value })}
                      />
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            <Button onClick={handleSaveFreightInfo} disabled={saveFreightInfo.isPending}>
              {saveFreightInfo.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Freight Information
            </Button>
          </TabsContent>
        </Tabs>

        {/* Submit Button */}
        <Card className="mt-6">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Ready to submit?</p>
                <p className="text-sm text-muted-foreground">
                  {requiredComplete 
                    ? "All required documents have been uploaded."
                    : "Please upload all required documents before submitting."}
                </p>
              </div>
              <Button 
                size="lg"
                onClick={handleCompleteSubmission}
                disabled={!requiredComplete || completeSubmission.isPending}
              >
                {completeSubmission.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-2" />
                )}
                Complete Submission
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
