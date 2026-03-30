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
import { DollarSign, BookOpen, Plus, Loader2, Tag, TrendingUp, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const BOOK_TYPE_COLORS: Record<string, string> = {
  standard: "bg-blue-500/10 text-blue-600",
  customer_specific: "bg-purple-500/10 text-purple-600",
  volume_discount: "bg-green-500/10 text-green-600",
  promotional: "bg-amber-500/10 text-amber-600",
  market_based: "bg-cyan-500/10 text-cyan-600",
  broker: "bg-indigo-500/10 text-indigo-600",
};

const BOOK_TYPE_LABELS: Record<string, string> = {
  standard: "Standard",
  customer_specific: "Customer Specific",
  volume_discount: "Volume Discount",
  promotional: "Promotional",
  market_based: "Market Based",
  broker: "Broker",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/10 text-green-600",
  inactive: "bg-gray-500/10 text-gray-600",
  draft: "bg-amber-500/10 text-amber-600",
  expired: "bg-red-500/10 text-red-600",
};

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatCurrency(value: string | number | null | undefined) {
  const num = parseFloat(String(value ?? "0"));
  if (isNaN(num)) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
}

function isExpiringSoon(expiryDate: string | null | undefined) {
  if (!expiryDate) return false;
  const expiry = new Date(expiryDate);
  const now = new Date();
  const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return expiry > now && expiry <= thirtyDaysOut;
}

export default function Pricing() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("price-books");
  const [bookSearch, setBookSearch] = useState("");
  const [selectedBookId, setSelectedBookId] = useState<string>("");
  const [bookDialogOpen, setBookDialogOpen] = useState(false);
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);

  const [bookForm, setBookForm] = useState({
    name: "",
    description: "",
    type: "standard" as string,
    customerId: "",
    effectiveDate: "",
    expiryDate: "",
    currency: "USD",
    notes: "",
  });

  const [entryForm, setEntryForm] = useState({
    productId: "",
    unitPrice: "",
    minQuantity: "",
    maxQuantity: "",
    pricingUnit: "",
    discountPercent: "",
    effectiveDate: "",
  });

  const { data: priceBooks, isLoading: booksLoading, refetch: refetchBooks } =
    trpc.qualityManagement.pricing.books.list.useQuery();

  const { data: priceEntries, isLoading: entriesLoading, refetch: refetchEntries } =
    trpc.qualityManagement.pricing.entries.listByBook.useQuery(
      { priceBookId: selectedBookId },
      { enabled: !!selectedBookId }
    );

  const { data: products } = trpc.products.list.useQuery();
  const { data: customers } = trpc.customers.list.useQuery();

  const createBook = trpc.qualityManagement.pricing.books.create.useMutation({
    onSuccess: () => {
      toast({ title: "Price book created successfully" });
      setBookDialogOpen(false);
      setBookForm({
        name: "",
        description: "",
        type: "standard",
        customerId: "",
        effectiveDate: "",
        expiryDate: "",
        currency: "USD",
        notes: "",
      });
      refetchBooks();
    },
    onError: (error) => {
      toast({ title: "Error creating price book", description: error.message, variant: "destructive" });
    },
  });

  const createEntry = trpc.qualityManagement.pricing.entries.create.useMutation({
    onSuccess: () => {
      toast({ title: "Price entry added successfully" });
      setEntryDialogOpen(false);
      setEntryForm({
        productId: "",
        unitPrice: "",
        minQuantity: "",
        maxQuantity: "",
        pricingUnit: "",
        discountPercent: "",
        effectiveDate: "",
      });
      refetchEntries();
    },
    onError: (error) => {
      toast({ title: "Error adding price entry", description: error.message, variant: "destructive" });
    },
  });

  const handleCreateBook = (e: React.FormEvent) => {
    e.preventDefault();
    createBook.mutate({
      name: bookForm.name,
      description: bookForm.description || undefined,
      type: bookForm.type,
      customerId: bookForm.customerId || undefined,
      effectiveDate: bookForm.effectiveDate ? new Date(bookForm.effectiveDate) : undefined,
      expiryDate: bookForm.expiryDate ? new Date(bookForm.expiryDate) : undefined,
      currency: bookForm.currency || "USD",
      notes: bookForm.notes || undefined,
    });
  };

  const handleCreateEntry = (e: React.FormEvent) => {
    e.preventDefault();
    createEntry.mutate({
      priceBookId: selectedBookId,
      productId: entryForm.productId,
      unitPrice: entryForm.unitPrice,
      minQuantity: entryForm.minQuantity ? parseFloat(entryForm.minQuantity) : undefined,
      maxQuantity: entryForm.maxQuantity ? parseFloat(entryForm.maxQuantity) : undefined,
      pricingUnit: entryForm.pricingUnit || undefined,
      discountPercent: entryForm.discountPercent || undefined,
      effectiveDate: entryForm.effectiveDate ? new Date(entryForm.effectiveDate) : undefined,
    });
  };

  const filteredBooks = priceBooks?.filter((book) =>
    book.name.toLowerCase().includes(bookSearch.toLowerCase()) ||
    (book.description ?? "").toLowerCase().includes(bookSearch.toLowerCase())
  );

  const activeBooks = priceBooks?.filter((b) => b.status === "active").length ?? 0;
  const customerSpecificBooks = priceBooks?.filter((b) => b.type === "customer_specific").length ?? 0;
  const totalEntries = priceBooks?.reduce((sum, b) => sum + (b.entriesCount ?? 0), 0) ?? 0;
  const expiringSoonCount = priceBooks?.filter((b) => isExpiringSoon(b.expiryDate)).length ?? 0;

  const selectedBook = priceBooks?.find((b) => b.id === selectedBookId);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <DollarSign className="h-8 w-8" />
            Pricing &amp; Price Books
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage contract pricing, volume discounts, and customer-specific pricing for foodservice ingredients.
          </p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Price Books</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{booksLoading ? "—" : activeBooks}</div>
            <p className="text-xs text-muted-foreground mt-1">Currently in effect</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Customer-Specific Books</CardTitle>
            <Tag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{booksLoading ? "—" : customerSpecificBooks}</div>
            <p className="text-xs text-muted-foreground mt-1">Tailored pricing agreements</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Products Priced</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{booksLoading ? "—" : totalEntries}</div>
            <p className="text-xs text-muted-foreground mt-1">Total price entries across all books</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expiring Soon</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{booksLoading ? "—" : expiringSoonCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Within the next 30 days</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="price-books">
            <BookOpen className="h-4 w-4 mr-2" />
            Price Books
          </TabsTrigger>
          <TabsTrigger value="price-entries">
            <Tag className="h-4 w-4 mr-2" />
            Price Entries
          </TabsTrigger>
        </TabsList>

        {/* Price Books Tab */}
        <TabsContent value="price-books" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search price books..."
                    value={bookSearch}
                    onChange={(e) => setBookSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Button onClick={() => setBookDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Price Book
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {booksLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !filteredBooks || filteredBooks.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>No price books found</p>
                  <p className="text-sm">Create your first price book to get started.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Effective Date</TableHead>
                      <TableHead>Expiry Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBooks.map((book) => (
                      <TableRow key={book.id}>
                        <TableCell className="font-medium">{book.name}</TableCell>
                        <TableCell>
                          <Badge className={BOOK_TYPE_COLORS[book.type] ?? "bg-gray-500/10 text-gray-600"}>
                            {BOOK_TYPE_LABELS[book.type] ?? book.type}
                          </Badge>
                        </TableCell>
                        <TableCell>{book.customerName ?? "-"}</TableCell>
                        <TableCell>
                          <Badge className={STATUS_COLORS[book.status] ?? "bg-gray-500/10 text-gray-600"}>
                            {book.status}
                          </Badge>
                          {isExpiringSoon(book.expiryDate) && (
                            <Badge className="ml-1 bg-amber-500/10 text-amber-600">Expiring Soon</Badge>
                          )}
                        </TableCell>
                        <TableCell>{formatDate(book.effectiveDate)}</TableCell>
                        <TableCell>{formatDate(book.expiryDate)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Price Entries Tab */}
        <TabsContent value="price-entries" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Label className="shrink-0 text-sm font-medium">Price Book:</Label>
                  <Select value={selectedBookId} onValueChange={setSelectedBookId}>
                    <SelectTrigger className="max-w-xs">
                      <SelectValue placeholder="Select a price book..." />
                    </SelectTrigger>
                    <SelectContent>
                      {priceBooks?.map((book) => (
                        <SelectItem key={book.id} value={book.id}>
                          {book.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedBookId && (
                  <Button onClick={() => setEntryDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Entry
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!selectedBookId ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Tag className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>Select a price book to view its entries</p>
                  <p className="text-sm">Choose a price book from the dropdown above.</p>
                </div>
              ) : entriesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !priceEntries || priceEntries.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>No price entries found</p>
                  <p className="text-sm">Add your first entry to this price book.</p>
                </div>
              ) : (
                <>
                  {selectedBook && (
                    <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
                      <BookOpen className="h-4 w-4" />
                      <span>
                        Showing {priceEntries.length} entr{priceEntries.length === 1 ? "y" : "ies"} for{" "}
                        <span className="font-medium text-foreground">{selectedBook.name}</span>
                      </span>
                    </div>
                  )}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Min Qty</TableHead>
                        <TableHead className="text-right">Max Qty</TableHead>
                        <TableHead>Pricing Unit</TableHead>
                        <TableHead className="text-right">Discount %</TableHead>
                        <TableHead>Effective Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {priceEntries.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="font-medium">{entry.productName ?? entry.productId}</TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(entry.unitPrice)}
                          </TableCell>
                          <TableCell className="text-right">
                            {entry.minQuantity != null ? entry.minQuantity : "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            {entry.maxQuantity != null ? entry.maxQuantity : "-"}
                          </TableCell>
                          <TableCell>{entry.pricingUnit ?? "-"}</TableCell>
                          <TableCell className="text-right">
                            {entry.discountPercent != null
                              ? `${parseFloat(String(entry.discountPercent)).toFixed(1)}%`
                              : "-"}
                          </TableCell>
                          <TableCell>{formatDate(entry.effectiveDate)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Price Book Dialog */}
      <Dialog open={bookDialogOpen} onOpenChange={setBookDialogOpen}>
        <DialogContent className="max-w-lg">
          <form onSubmit={handleCreateBook}>
            <DialogHeader>
              <DialogTitle>New Price Book</DialogTitle>
              <DialogDescription>
                Create a new pricing book for contract or volume-based pricing.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto pr-1">
              <div className="space-y-2">
                <Label htmlFor="book-name">Name *</Label>
                <Input
                  id="book-name"
                  value={bookForm.name}
                  onChange={(e) => setBookForm({ ...bookForm, name: e.target.value })}
                  placeholder="e.g. Q2 2026 Standard Pricing"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="book-description">Description</Label>
                <Input
                  id="book-description"
                  value={bookForm.description}
                  onChange={(e) => setBookForm({ ...bookForm, description: e.target.value })}
                  placeholder="Brief description of this price book"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="book-type">Type *</Label>
                  <Select
                    value={bookForm.type}
                    onValueChange={(value) => setBookForm({ ...bookForm, type: value })}
                  >
                    <SelectTrigger id="book-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="customer_specific">Customer Specific</SelectItem>
                      <SelectItem value="volume_discount">Volume Discount</SelectItem>
                      <SelectItem value="promotional">Promotional</SelectItem>
                      <SelectItem value="market_based">Market Based</SelectItem>
                      <SelectItem value="broker">Broker</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="book-currency">Currency</Label>
                  <Select
                    value={bookForm.currency}
                    onValueChange={(value) => setBookForm({ ...bookForm, currency: value })}
                  >
                    <SelectTrigger id="book-currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="CAD">CAD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {bookForm.type === "customer_specific" && (
                <div className="space-y-2">
                  <Label htmlFor="book-customer">Customer</Label>
                  <Select
                    value={bookForm.customerId}
                    onValueChange={(value) => setBookForm({ ...bookForm, customerId: value })}
                  >
                    <SelectTrigger id="book-customer">
                      <SelectValue placeholder="Select a customer (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers?.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id}>
                          {customer.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="book-effective-date">Effective Date</Label>
                  <Input
                    id="book-effective-date"
                    type="date"
                    value={bookForm.effectiveDate}
                    onChange={(e) => setBookForm({ ...bookForm, effectiveDate: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="book-expiry-date">Expiry Date</Label>
                  <Input
                    id="book-expiry-date"
                    type="date"
                    value={bookForm.expiryDate}
                    onChange={(e) => setBookForm({ ...bookForm, expiryDate: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="book-notes">Notes</Label>
                <Input
                  id="book-notes"
                  value={bookForm.notes}
                  onChange={(e) => setBookForm({ ...bookForm, notes: e.target.value })}
                  placeholder="Internal notes or terms"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBookDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createBook.isPending}>
                {createBook.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Price Book
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Price Entry Dialog */}
      <Dialog open={entryDialogOpen} onOpenChange={setEntryDialogOpen}>
        <DialogContent className="max-w-lg">
          <form onSubmit={handleCreateEntry}>
            <DialogHeader>
              <DialogTitle>Add Price Entry</DialogTitle>
              <DialogDescription>
                Add a product pricing entry to{" "}
                <span className="font-medium">{selectedBook?.name ?? "the selected price book"}</span>.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto pr-1">
              <div className="space-y-2">
                <Label htmlFor="entry-product">Product *</Label>
                <Select
                  value={entryForm.productId}
                  onValueChange={(value) => setEntryForm({ ...entryForm, productId: value })}
                >
                  <SelectTrigger id="entry-product">
                    <SelectValue placeholder="Select a product..." />
                  </SelectTrigger>
                  <SelectContent>
                    {products?.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="entry-unit-price">Unit Price *</Label>
                  <Input
                    id="entry-unit-price"
                    type="number"
                    step="0.0001"
                    min="0"
                    value={entryForm.unitPrice}
                    onChange={(e) => setEntryForm({ ...entryForm, unitPrice: e.target.value })}
                    placeholder="0.00"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="entry-pricing-unit">Pricing Unit</Label>
                  <Input
                    id="entry-pricing-unit"
                    value={entryForm.pricingUnit}
                    onChange={(e) => setEntryForm({ ...entryForm, pricingUnit: e.target.value })}
                    placeholder="e.g. lb, kg, case"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="entry-min-qty">Min Quantity</Label>
                  <Input
                    id="entry-min-qty"
                    type="number"
                    step="0.01"
                    min="0"
                    value={entryForm.minQuantity}
                    onChange={(e) => setEntryForm({ ...entryForm, minQuantity: e.target.value })}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="entry-max-qty">Max Quantity</Label>
                  <Input
                    id="entry-max-qty"
                    type="number"
                    step="0.01"
                    min="0"
                    value={entryForm.maxQuantity}
                    onChange={(e) => setEntryForm({ ...entryForm, maxQuantity: e.target.value })}
                    placeholder="No limit"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="entry-discount">Discount %</Label>
                  <Input
                    id="entry-discount"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={entryForm.discountPercent}
                    onChange={(e) => setEntryForm({ ...entryForm, discountPercent: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="entry-effective-date">Effective Date</Label>
                  <Input
                    id="entry-effective-date"
                    type="date"
                    value={entryForm.effectiveDate}
                    onChange={(e) => setEntryForm({ ...entryForm, effectiveDate: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEntryDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createEntry.isPending || !entryForm.productId || !entryForm.unitPrice}>
                {createEntry.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Add Entry
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
