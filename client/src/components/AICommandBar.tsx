import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import {
  Bot, Search, Loader2, Sparkles, ArrowRight, Command,
  FileText, Package, Users, DollarSign, Truck, ClipboardList,
  Send, X, CheckCircle, Clock, Building, AlertCircle, Box, Mail
} from "lucide-react";
import { useLocation } from "wouter";
import { QuickCreateDialog } from "@/components/QuickCreateDialog";

interface AICommandBarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context?: {
    type: string;
    id?: number | string;
    name?: string;
    data?: any;
  };
}

// Task types that can be created via AI Command Bar
type TaskType = "generate_po" | "send_rfq" | "send_quote_request" | "send_email" | "update_inventory" | "create_shipment" | "generate_invoice" | "reconcile_payment" | "reorder_materials" | "vendor_followup" | "create_work_order" | "query" | "reply_email" | "approve_po" | "approve_invoice" | "create_vendor" | "create_material" | "create_product" | "create_bom" | "create_customer";

// ============================================
// Natural Language Parsing Utilities
// ============================================

interface ParsedQuantity {
  value: number;
  unit: string;
  originalText: string;
}

interface ParsedDate {
  date: Date;
  originalText: string;
  isRelative: boolean;
}

// Unit conversion factors to base unit (units)
const UNIT_CONVERSIONS: Record<string, { factor: number; baseUnit: string }> = {
  // Weight units
  'kg': { factor: 1, baseUnit: 'kg' },
  'kgs': { factor: 1, baseUnit: 'kg' },
  'kilogram': { factor: 1, baseUnit: 'kg' },
  'kilograms': { factor: 1, baseUnit: 'kg' },
  'lb': { factor: 0.453592, baseUnit: 'kg' },
  'lbs': { factor: 0.453592, baseUnit: 'kg' },
  'pound': { factor: 0.453592, baseUnit: 'kg' },
  'pounds': { factor: 0.453592, baseUnit: 'kg' },
  'g': { factor: 0.001, baseUnit: 'kg' },
  'gram': { factor: 0.001, baseUnit: 'kg' },
  'grams': { factor: 0.001, baseUnit: 'kg' },
  'oz': { factor: 0.0283495, baseUnit: 'kg' },
  'ounce': { factor: 0.0283495, baseUnit: 'kg' },
  'ounces': { factor: 0.0283495, baseUnit: 'kg' },
  // Volume units
  'l': { factor: 1, baseUnit: 'L' },
  'liter': { factor: 1, baseUnit: 'L' },
  'liters': { factor: 1, baseUnit: 'L' },
  'litre': { factor: 1, baseUnit: 'L' },
  'litres': { factor: 1, baseUnit: 'L' },
  'ml': { factor: 0.001, baseUnit: 'L' },
  'gal': { factor: 3.78541, baseUnit: 'L' },
  'gallon': { factor: 3.78541, baseUnit: 'L' },
  'gallons': { factor: 3.78541, baseUnit: 'L' },
  // Count units
  'unit': { factor: 1, baseUnit: 'units' },
  'units': { factor: 1, baseUnit: 'units' },
  'piece': { factor: 1, baseUnit: 'units' },
  'pieces': { factor: 1, baseUnit: 'units' },
  'pcs': { factor: 1, baseUnit: 'units' },
  'ea': { factor: 1, baseUnit: 'units' },
  'each': { factor: 1, baseUnit: 'units' },
  // Container units
  'case': { factor: 1, baseUnit: 'cases' },
  'cases': { factor: 1, baseUnit: 'cases' },
  'box': { factor: 1, baseUnit: 'boxes' },
  'boxes': { factor: 1, baseUnit: 'boxes' },
  'pallet': { factor: 1, baseUnit: 'pallets' },
  'pallets': { factor: 1, baseUnit: 'pallets' },
  'carton': { factor: 1, baseUnit: 'cartons' },
  'cartons': { factor: 1, baseUnit: 'cartons' },
  'bag': { factor: 1, baseUnit: 'bags' },
  'bags': { factor: 1, baseUnit: 'bags' },
  'roll': { factor: 1, baseUnit: 'rolls' },
  'rolls': { factor: 1, baseUnit: 'rolls' },
};

// Parse quantity with unit from natural language
function parseQuantity(text: string): ParsedQuantity | null {
  // Match patterns like "50kg", "100 lbs", "25 cases", "1,000 units"
  const patterns = [
    // Number with unit attached: "50kg", "100lbs"
    /([\d,]+(?:\.\d+)?)\s*(kg|kgs|kilogram|kilograms|lb|lbs|pound|pounds|g|gram|grams|oz|ounce|ounces|l|liter|liters|litre|litres|ml|gal|gallon|gallons|unit|units|piece|pieces|pcs|ea|each|case|cases|box|boxes|pallet|pallets|carton|cartons|bag|bags|roll|rolls)\b/i,
    // Number with unit separated: "50 kg", "100 lbs"
    /([\d,]+(?:\.\d+)?)\s+(kg|kgs|kilogram|kilograms|lb|lbs|pound|pounds|g|gram|grams|oz|ounce|ounces|l|liter|liters|litre|litres|ml|gal|gallon|gallons|unit|units|piece|pieces|pcs|ea|each|case|cases|box|boxes|pallet|pallets|carton|cartons|bag|bags|roll|rolls)\b/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const numStr = match[1].replace(/,/g, '');
      const value = parseFloat(numStr);
      const unitKey = match[2].toLowerCase();
      const unitInfo = UNIT_CONVERSIONS[unitKey];
      
      if (unitInfo && !isNaN(value)) {
        return {
          value,
          unit: unitInfo.baseUnit,
          originalText: match[0]
        };
      }
    }
  }
  
  // Fallback: just a number without unit
  const numberMatch = text.match(/\b([\d,]+(?:\.\d+)?)\b/);
  if (numberMatch) {
    const value = parseFloat(numberMatch[1].replace(/,/g, ''));
    if (!isNaN(value) && value > 0) {
      return {
        value,
        unit: 'units',
        originalText: numberMatch[0]
      };
    }
  }
  
  return null;
}

// Day name to number mapping
const DAY_NAMES: Record<string, number> = {
  'sunday': 0, 'sun': 0,
  'monday': 1, 'mon': 1,
  'tuesday': 2, 'tue': 2, 'tues': 2,
  'wednesday': 3, 'wed': 3,
  'thursday': 4, 'thu': 4, 'thur': 4, 'thurs': 4,
  'friday': 5, 'fri': 5,
  'saturday': 6, 'sat': 6,
};

// Month name to number mapping
const MONTH_NAMES: Record<string, number> = {
  'january': 0, 'jan': 0,
  'february': 1, 'feb': 1,
  'march': 2, 'mar': 2,
  'april': 3, 'apr': 3,
  'may': 4,
  'june': 5, 'jun': 5,
  'july': 6, 'jul': 6,
  'august': 7, 'aug': 7,
  'september': 8, 'sep': 8, 'sept': 8,
  'october': 9, 'oct': 9,
  'november': 10, 'nov': 10,
  'december': 11, 'dec': 11,
};

// Parse date from natural language
function parseDate(text: string): ParsedDate | null {
  const lowerText = text.toLowerCase();
  const now = new Date();
  
  // Today/Tomorrow/Yesterday
  if (/\btoday\b/.test(lowerText)) {
    return { date: now, originalText: 'today', isRelative: true };
  }
  if (/\btomorrow\b/.test(lowerText)) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return { date: tomorrow, originalText: 'tomorrow', isRelative: true };
  }
  if (/\byesterday\b/.test(lowerText)) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return { date: yesterday, originalText: 'yesterday', isRelative: true };
  }
  
  // "next [day]" - e.g., "next Friday", "next Monday"
  const nextDayMatch = lowerText.match(/\bnext\s+(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat)\b/);
  if (nextDayMatch) {
    const targetDay = DAY_NAMES[nextDayMatch[1]];
    const result = new Date(now);
    const currentDay = result.getDay();
    let daysToAdd = targetDay - currentDay;
    if (daysToAdd <= 0) daysToAdd += 7; // Always go to next week
    result.setDate(result.getDate() + daysToAdd);
    return { date: result, originalText: nextDayMatch[0], isRelative: true };
  }
  
  // "this [day]" - e.g., "this Friday"
  const thisDayMatch = lowerText.match(/\bthis\s+(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat)\b/);
  if (thisDayMatch) {
    const targetDay = DAY_NAMES[thisDayMatch[1]];
    const result = new Date(now);
    const currentDay = result.getDay();
    let daysToAdd = targetDay - currentDay;
    if (daysToAdd < 0) daysToAdd += 7;
    result.setDate(result.getDate() + daysToAdd);
    return { date: result, originalText: thisDayMatch[0], isRelative: true };
  }
  
  // "in X days/weeks/months" - e.g., "in 2 weeks", "in 3 days"
  const inTimeMatch = lowerText.match(/\bin\s+(\d+)\s*(day|days|week|weeks|month|months)\b/);
  if (inTimeMatch) {
    const amount = parseInt(inTimeMatch[1]);
    const unit = inTimeMatch[2];
    const result = new Date(now);
    
    if (unit.startsWith('day')) {
      result.setDate(result.getDate() + amount);
    } else if (unit.startsWith('week')) {
      result.setDate(result.getDate() + (amount * 7));
    } else if (unit.startsWith('month')) {
      result.setMonth(result.getMonth() + amount);
    }
    
    return { date: result, originalText: inTimeMatch[0], isRelative: true };
  }
  
  // "next week/month" 
  if (/\bnext\s+week\b/.test(lowerText)) {
    const result = new Date(now);
    result.setDate(result.getDate() + 7);
    return { date: result, originalText: 'next week', isRelative: true };
  }
  if (/\bnext\s+month\b/.test(lowerText)) {
    const result = new Date(now);
    result.setMonth(result.getMonth() + 1);
    return { date: result, originalText: 'next month', isRelative: true };
  }
  
  // "end of week/month"
  if (/\bend\s+of\s+(the\s+)?week\b/.test(lowerText)) {
    const result = new Date(now);
    const daysUntilFriday = (5 - result.getDay() + 7) % 7 || 7;
    result.setDate(result.getDate() + daysUntilFriday);
    return { date: result, originalText: 'end of week', isRelative: true };
  }
  if (/\bend\s+of\s+(the\s+)?month\b/.test(lowerText)) {
    const result = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { date: result, originalText: 'end of month', isRelative: true };
  }
  
  // Absolute dates: "March 15th", "March 15", "15th March"
  const monthDayMatch = lowerText.match(/\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (monthDayMatch) {
    const month = MONTH_NAMES[monthDayMatch[1]];
    const day = parseInt(monthDayMatch[2]);
    let year = now.getFullYear();
    // If the date has passed this year, assume next year
    const result = new Date(year, month, day);
    if (result < now) {
      result.setFullYear(year + 1);
    }
    return { date: result, originalText: monthDayMatch[0], isRelative: false };
  }
  
  // Day Month format: "15th March", "15 March"
  const dayMonthMatch = lowerText.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\b/);
  if (dayMonthMatch) {
    const day = parseInt(dayMonthMatch[1]);
    const month = MONTH_NAMES[dayMonthMatch[2]];
    let year = now.getFullYear();
    const result = new Date(year, month, day);
    if (result < now) {
      result.setFullYear(year + 1);
    }
    return { date: result, originalText: dayMonthMatch[0], isRelative: false };
  }
  
  // ISO format: "2026-03-15"
  const isoMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    const result = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
    return { date: result, originalText: isoMatch[0], isRelative: false };
  }
  
  // US format: "3/15/26" or "03/15/2026"
  const usDateMatch = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (usDateMatch) {
    let year = parseInt(usDateMatch[3]);
    if (year < 100) year += 2000; // Convert 26 to 2026
    const result = new Date(year, parseInt(usDateMatch[1]) - 1, parseInt(usDateMatch[2]));
    return { date: result, originalText: usDateMatch[0], isRelative: false };
  }
  
  return null;
}

// Extract material name from query
function extractMaterialName(query: string): string | null {
  const lowerQuery = query.toLowerCase();
  
  // Patterns to extract material name
  const patterns = [
    // "order X of [material]" or "order [material]"
    /(?:order|purchase|buy|get|need)\s+(?:[\d,]+\s*(?:kg|kgs|lb|lbs|units?|cases?|boxes?|pieces?)?\s+(?:of\s+)?)?([a-zA-Z][a-zA-Z\s]+?)(?:\s+(?:from|by|before|for|at|$))/i,
    // "PO for [material]"
    /(?:po|purchase\s+order)\s+(?:for\s+)?(?:[\d,]+\s*(?:kg|kgs|lb|lbs|units?|cases?|boxes?|pieces?)?\s+(?:of\s+)?)?([a-zA-Z][a-zA-Z\s]+?)(?:\s+(?:from|by|before|for|at|$))/i,
    // "[quantity] [material]"
    /(?:[\d,]+\s*(?:kg|kgs|lb|lbs|units?|cases?|boxes?|pieces?)\s+(?:of\s+)?)([a-zA-Z][a-zA-Z\s]+?)(?:\s+(?:from|by|before|for|at|$))/i,
  ];
  
  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match && match[1]) {
      // Clean up the material name
      let name = match[1].trim();
      // Remove common trailing words
      name = name.replace(/\s+(please|asap|urgently|immediately)$/i, '').trim();
      if (name.length > 2 && name.length < 50) {
        return name;
      }
    }
  }
  
  return null;
}

interface ParsedIntent {
  taskType: TaskType;
  taskData: Record<string, any>;
  description: string;
}

const quickActions = [
  { icon: FileText, label: "Summarize this contract", query: "Summarize the key terms and risks of this contract", context: ["contract"], taskType: "query" as TaskType },
  { icon: DollarSign, label: "Why did margins drop?", query: "Analyze why profit margins dropped last month and suggest improvements", context: ["dashboard", "finance"], taskType: "query" as TaskType },
  { icon: Package, label: "Check inventory levels", query: "Show me products with low stock that need reordering", context: ["inventory", "products"], taskType: "query" as TaskType },
  { icon: Truck, label: "Draft vendor delay response", query: "Draft a professional response to this vendor about their shipment delay", context: ["vendor", "po", "shipment"], taskType: "send_email" as TaskType },
  { icon: ClipboardList, label: "Generate PO from forecast", query: "Based on demand forecast, generate purchase orders for materials running low", context: ["procurement", "forecast"], taskType: "generate_po" as TaskType },
  { icon: Users, label: "Find customer insights", query: "Analyze this customer's purchase history and suggest upsell opportunities", context: ["customer", "sales"], taskType: "query" as TaskType },
  { icon: DollarSign, label: "Create invoice quickly", query: "$500 invoice to Acme Corp for consulting services", context: ["finance", "sales", "invoice"], taskType: "generate_invoice" as TaskType },
  { icon: ClipboardList, label: "Create PO with text", query: "Order 500kg mushrooms from Fresh Farms by Friday", context: ["procurement"], taskType: "generate_po" as TaskType },
  { icon: Truck, label: "Track shipment", query: "FedEx tracking 123456789 delivered to warehouse", context: ["logistics", "shipment"], taskType: "create_shipment" as TaskType },
  { icon: DollarSign, label: "Record payment", query: "$5000 payment received from Acme Corp for INV-001", context: ["finance", "payment"], taskType: "reconcile_payment" as TaskType },
  { icon: Package, label: "Create work order", query: "Produce 1000 units of Widget A by end of month", context: ["manufacturing", "production"], taskType: "create_work_order" as TaskType },
  { icon: Package, label: "Transfer inventory", query: "Transfer 100kg flour from Main Warehouse to Production", context: ["inventory", "warehouse"], taskType: "update_inventory" as TaskType },
  // Entity creation quick actions
  { icon: Building, label: "Add new vendor", query: "Create a new vendor", context: ["procurement", "vendor"], taskType: "create_vendor" as TaskType },
  { icon: Package, label: "Add new material", query: "Create a new raw material", context: ["procurement", "inventory"], taskType: "create_material" as TaskType },
  { icon: Box, label: "Add new product", query: "Create a new product", context: ["products", "manufacturing"], taskType: "create_product" as TaskType },
  { icon: Users, label: "Add new customer", query: "Create a new customer", context: ["sales", "customer"], taskType: "create_customer" as TaskType },
  // Email and approval actions
  { icon: Mail, label: "Reply to vendor email", query: "Draft a reply to this vendor's email", context: ["vendor", "email"], taskType: "reply_email" as TaskType },
  { icon: CheckCircle, label: "Approve pending PO", query: "Review and approve this purchase order", context: ["po", "approval"], taskType: "approve_po" as TaskType },
];

// Parse natural language query to determine intent
function parseIntent(query: string): ParsedIntent {
  const lowerQuery = query.toLowerCase();
  
  // Parse quantity and date from the query
  const parsedQuantity = parseQuantity(query);
  const parsedDate = parseDate(query);
  const materialName = extractMaterialName(query);
  
  // Check for PO generation intent
  const isPOIntent = 
    lowerQuery.includes("generate po") || 
    lowerQuery.includes("create po") || 
    lowerQuery.includes("purchase order") ||
    lowerQuery.includes("reorder") ||
    (lowerQuery.includes("order") && 
      (lowerQuery.includes("material") || lowerQuery.includes("stock") || 
       lowerQuery.includes("inventory") || parsedQuantity !== null));
  
  if (isPOIntent) {
    // Build description with parsed values
    let description = "Generate PO";
    if (parsedQuantity) {
      description += ` for ${parsedQuantity.value} ${parsedQuantity.unit}`;
    }
    if (materialName) {
      description += ` of ${materialName}`;
    }
    if (parsedDate) {
      description += ` by ${parsedDate.originalText}`;
    }
    
    return {
      taskType: "generate_po",
      taskData: {
        rawMaterialName: materialName,
        quantity: parsedQuantity?.value || 1,
        quantityUnit: parsedQuantity?.unit || 'units',
        unitCost: null,
        requiredDate: parsedDate?.date.toISOString() || null,
        requiredDateText: parsedDate?.originalText || null,
        vendorId: null
      },
      description
    };
  }
  
  // Check for RFQ intent
  if (lowerQuery.includes("rfq") || lowerQuery.includes("request for quote") || 
      lowerQuery.includes("get quotes") || lowerQuery.includes("freight quote")) {
    return {
      taskType: "send_rfq",
      taskData: {
        description: query,
        requiredDate: parsedDate?.date.toISOString() || null,
        requiredDateText: parsedDate?.originalText || null,
      },
      description: `Send RFQ${parsedDate ? ` (needed by ${parsedDate.originalText})` : ''}`
    };
  }
  
  // Check for email intent
  if (lowerQuery.includes("email") || lowerQuery.includes("send") && 
      (lowerQuery.includes("vendor") || lowerQuery.includes("supplier") || lowerQuery.includes("carrier"))) {
    return {
      taskType: "send_email",
      taskData: {
        subject: null,
        body: query
      },
      description: "Draft and send email"
    };
  }
  
  // Check for work order intent
  if (lowerQuery.includes("work order") || lowerQuery.includes("production") || 
      lowerQuery.includes("manufacture") || lowerQuery.includes("produce")) {
    return {
      taskType: "create_work_order",
      taskData: {
        text: query,
        description: query,
        quantity: parsedQuantity?.value || null,
        quantityUnit: parsedQuantity?.unit || null,
        requiredDate: parsedDate?.date.toISOString() || null,
      },
      description: `Create work order${parsedQuantity ? ` for ${parsedQuantity.value} ${parsedQuantity.unit}` : ''}${parsedDate ? ` by ${parsedDate.originalText}` : ''}`
    };
  }
  
  // Check for shipment tracking intent
  if ((lowerQuery.includes("track") || lowerQuery.includes("shipment") || lowerQuery.includes("tracking")) &&
      (lowerQuery.includes("fedex") || lowerQuery.includes("ups") || lowerQuery.includes("dhl") || 
       lowerQuery.includes("usps") || /\b\d{10,}\b/.test(query))) {
    return {
      taskType: "create_shipment",
      taskData: { text: query },
      description: "Track shipment"
    };
  }
  
  // Check for payment/reconciliation intent
  if ((lowerQuery.includes("payment") || lowerQuery.includes("paid") || lowerQuery.includes("received")) &&
      (lowerQuery.includes("$") || lowerQuery.includes("amount") || lowerQuery.includes("invoice"))) {
    return {
      taskType: "reconcile_payment",
      taskData: { text: query },
      description: "Record payment"
    };
  }
  
  // Check for inventory transfer intent
  if ((lowerQuery.includes("transfer") || lowerQuery.includes("move")) &&
      (lowerQuery.includes("inventory") || lowerQuery.includes("warehouse") || 
       lowerQuery.includes("from") && lowerQuery.includes("to"))) {
    return {
      taskType: "update_inventory",
      taskData: { text: query },
      description: "Transfer inventory"
    };
  }
  
  // Check for vendor creation intent
  if ((lowerQuery.includes("create") || lowerQuery.includes("add") || lowerQuery.includes("new")) && 
      (lowerQuery.includes("vendor") || lowerQuery.includes("supplier"))) {
    return {
      taskType: "create_vendor",
      taskData: { description: query },
      description: "Create new vendor"
    };
  }
  
  // Check for material creation intent
  if ((lowerQuery.includes("create") || lowerQuery.includes("add") || lowerQuery.includes("new")) && 
      (lowerQuery.includes("material") || lowerQuery.includes("ingredient") || lowerQuery.includes("raw material"))) {
    return {
      taskType: "create_material",
      taskData: { description: query },
      description: "Create new material"
    };
  }
  
  // Check for product creation intent
  if ((lowerQuery.includes("create") || lowerQuery.includes("add") || lowerQuery.includes("new")) && 
      lowerQuery.includes("product")) {
    return {
      taskType: "create_product",
      taskData: { description: query },
      description: "Create new product"
    };
  }
  
  // Check for customer creation intent
  if ((lowerQuery.includes("create") || lowerQuery.includes("add") || lowerQuery.includes("new")) && 
      lowerQuery.includes("customer")) {
    return {
      taskType: "create_customer",
      taskData: { description: query },
      description: "Create new customer"
    };
  }
  
  // Check for BOM creation intent
  if ((lowerQuery.includes("create") || lowerQuery.includes("add") || lowerQuery.includes("new")) && 
      (lowerQuery.includes("bom") || lowerQuery.includes("bill of material") || lowerQuery.includes("recipe"))) {
    return {
      taskType: "create_bom",
      taskData: { description: query },
      description: "Create new BOM"
    };
  }
  
  // Check for email reply intent
  if (lowerQuery.includes("reply") && lowerQuery.includes("email")) {
    return {
      taskType: "reply_email",
      taskData: { description: query },
      description: "Draft email reply"
    };
  }
  
  // Check for PO approval intent
  if ((lowerQuery.includes("approve") || lowerQuery.includes("confirm")) && 
      (lowerQuery.includes("po") || lowerQuery.includes("purchase order"))) {
    return {
      taskType: "approve_po",
      taskData: { description: query },
      description: "Approve purchase order"
    };
  }
  
  // Check for invoice approval intent
  if ((lowerQuery.includes("approve") || lowerQuery.includes("confirm")) && 
      lowerQuery.includes("invoice")) {
    return {
      taskType: "approve_invoice",
      taskData: { description: query },
      description: "Approve invoice"
    };
  }
  
  // Check for invoice creation intent
  const isInvoiceIntent = 
    // Explicit invoice creation: "create/generate/send invoice/bill"
    ((lowerQuery.includes("create") || lowerQuery.includes("generate") || lowerQuery.includes("send")) && 
     (lowerQuery.includes("invoice") || lowerQuery.includes("bill"))) ||
    // Direct invoice patterns: "$500 invoice to...", "invoice for...", etc.
    (lowerQuery.includes("invoice") && 
     (lowerQuery.includes("$") || lowerQuery.includes("for") || lowerQuery.includes("to") || 
      lowerQuery.includes("bill to") || lowerQuery.includes("net"))) ||
    // "bill to" with amount: "bill to customer $500"
    (lowerQuery.includes("bill") && lowerQuery.includes("to") && lowerQuery.includes("$"));
  
  if (isInvoiceIntent) {
    return {
      taskType: "generate_invoice",
      taskData: { text: query },
      description: "Create invoice from text"
    };
  }
  
  // Default to query
  return {
    taskType: "query",
    taskData: { question: query },
    description: "AI Query"
  };
}

// Vendor suggestion interface
interface VendorSuggestion {
  material: {
    id: number;
    name: string;
    sku: string | null;
    unit: string | null;
    unitCost: string | null;
  } | null;
  preferredVendor: {
    id: number;
    name: string;
    email: string | null;
  } | null;
  suggestedVendor: {
    id: number;
    name: string;
    email: string | null;
    poCount: number;
    lastOrderDate: Date | null;
  } | null;
  lastPurchasePrice: string | null;
  recentPOCount: number;
}

export function AICommandBar({ open, onOpenChange, context }: AICommandBarProps) {
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [taskCreated, setTaskCreated] = useState<{ id: number; status: string; taskType?: string } | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [vendorSuggestion, setVendorSuggestion] = useState<VendorSuggestion | null>(null);
  const [debouncedMaterialName, setDebouncedMaterialName] = useState<string | null>(null);
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null);
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);
  // New states for enhanced UX
  const [showDraftPreview, setShowDraftPreview] = useState(false);
  const [draftData, setDraftData] = useState<{
    taskType: TaskType;
    material: { id: number; name: string; sku: string | null; unit: string | null } | null;
    vendor: { id: number; name: string; email: string | null } | null;
    quantity: number | null;
    unit: string | null;
    requiredDate: Date | null;
    estimatedPrice: number | null;
    originalQuery: string;
  } | null>(null);
  const [materialSearch, setMaterialSearch] = useState("");
  const [showMaterialDropdown, setShowMaterialDropdown] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<{ id: number; name: string; sku: string | null; unit: string | null } | null>(null);
  const [editingQuantity, setEditingQuantity] = useState<string>("");
  const [editingDate, setEditingDate] = useState<string>("");
  const [showQuickCreateVendor, setShowQuickCreateVendor] = useState(false);
  const [showQuickCreateMaterial, setShowQuickCreateMaterial] = useState(false);
  const [showQuickCreateProduct, setShowQuickCreateProduct] = useState(false);
  const [showQuickCreateCustomer, setShowQuickCreateCustomer] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  // AI Query mutation for general questions
  const aiQuery = trpc.ai.query.useMutation({
    onSuccess: (data) => {
      setResponse(data.answer);
      setIsLoading(false);
    },
    onError: (error) => {
      toast.error(error.message);
      setIsLoading(false);
    },
  });

  // AI Agent task creation mutation
  const createTask = trpc.aiAgent.tasks.create.useMutation({
    onSuccess: (data) => {
      setTaskCreated({ id: data.id, status: data.status || 'pending_approval', taskType: data.taskType });
      setIsLoading(false);
      toast.success(`AI Task created: ${data.taskType}`, {
        description: data.status === "pending_approval" 
          ? "Task is pending approval in the Approval Queue" 
          : "Task has been queued for execution"
      });
      utils.aiAgent.tasks.list.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to create task: ${error.message}`);
      setIsLoading(false);
    },
  });

  // Invoice creation from text mutation
  const createInvoiceFromText = trpc.invoices.createFromText.useMutation({
    onSuccess: (data) => {
      setIsLoading(false);
      toast.success("Invoice created successfully", {
        description: `Invoice #${data.invoiceNumber} has been created as a draft`
      });
      utils.invoices.list.invalidate();
      setLocation("/finance/invoices");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(`Failed to create invoice: ${error.message}`);
      setIsLoading(false);
    },
  });

  // Universal entity creation from text mutations
  const createPOFromText = trpc.purchaseOrders.createFromText.useMutation({
    onSuccess: (data) => {
      setIsLoading(false);
      toast.success("Purchase Order created successfully", {
        description: `PO #${data.poNumber} has been created`
      });
      utils.purchaseOrders.list.invalidate();
      setLocation("/procurement");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(`Failed to create PO: ${error.message}`);
      setIsLoading(false);
    },
  });

  const createShipmentFromText = trpc.shipments.createFromText.useMutation({
    onSuccess: (data) => {
      setIsLoading(false);
      toast.success("Shipment tracked successfully", {
        description: `Shipment #${data.trackingNumber} has been added`
      });
      utils.shipments.list.invalidate();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(`Failed to track shipment: ${error.message}`);
      setIsLoading(false);
    },
  });

  const recordPaymentFromText = trpc.payments.createFromText.useMutation({
    onSuccess: (data) => {
      setIsLoading(false);
      toast.success("Payment recorded successfully", {
        description: `Payment of $${data.amount} has been recorded`
      });
      utils.payments.list.invalidate();
      setLocation("/finance");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(`Failed to record payment: ${error.message}`);
      setIsLoading(false);
    },
  });

  const createWorkOrderFromText = trpc.workOrders.createFromText.useMutation({
    onSuccess: (data) => {
      setIsLoading(false);
      toast.success("Work Order created successfully", {
        description: `Work Order #${data.workOrderNumber} has been created`
      });
      utils.workOrders.list.invalidate();
      setLocation("/operations/manufacturing");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(`Failed to create work order: ${error.message}`);
      setIsLoading(false);
    },
  });

  const transferInventoryFromText = trpc.inventory.transferFromText.useMutation({
    onSuccess: (data) => {
      setIsLoading(false);
      toast.success("Inventory transfer initiated", {
        description: `Transfer #${data.transferId} has been created`
      });
      utils.inventory.list.invalidate();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(`Failed to transfer inventory: ${error.message}`);
      setIsLoading(false);
    },
  });

  // Query all vendors for manual selection
  const vendorsQuery = trpc.vendors.list.useQuery(
    {},
    { enabled: showVendorDropdown || showDraftPreview }
  );

  // Query materials for autocomplete
  const materialsQuery = trpc.rawMaterials.list.useQuery(
    {},
    { enabled: showMaterialDropdown || showDraftPreview }
  );

  // Filter materials based on search
  const filteredMaterials = materialsQuery.data?.filter(m => 
    materialSearch.length > 0 && (
      m.name.toLowerCase().includes(materialSearch.toLowerCase()) ||
      (m.sku && m.sku.toLowerCase().includes(materialSearch.toLowerCase()))
    )
  ).slice(0, 10) || [];

  // Query for vendor suggestion based on material name
  const vendorSuggestionQuery = trpc.rawMaterials.getPreferredVendor.useQuery(
    { materialName: debouncedMaterialName || undefined },
    { 
      enabled: !!debouncedMaterialName && debouncedMaterialName.length > 2,
      staleTime: 30000, // Cache for 30 seconds
    }
  );

  // Update vendor suggestion when query returns
  useEffect(() => {
    if (vendorSuggestionQuery.data) {
      setVendorSuggestion(vendorSuggestionQuery.data as VendorSuggestion);
    }
  }, [vendorSuggestionQuery.data]);

  // Debounce material name extraction from query
  useEffect(() => {
    const timer = setTimeout(() => {
      const materialName = extractMaterialName(query);
      setDebouncedMaterialName(materialName);
    }, 500); // 500ms debounce
    
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
    if (!open) {
      setQuery("");
      setResponse(null);
      setTaskCreated(null);
      setShowSuggestions(true);
      setVendorSuggestion(null);
      setDebouncedMaterialName(null);
      setSelectedVendorId(null);
      setShowVendorDropdown(false);
      setShowDraftPreview(false);
      setDraftData(null);
      setMaterialSearch("");
      setShowMaterialDropdown(false);
      setSelectedMaterial(null);
      setEditingQuantity("");
      setEditingDate("");
    }
  }, [open]);

  // Global keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
      if (e.key === "Escape" && open) {
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  const handleSubmit = useCallback(async (q: string, forceTaskType?: TaskType) => {
    if (!q.trim()) return;
    setShowSuggestions(false);
    setResponse(null);
    setTaskCreated(null);
    
    // Parse the intent from the query
    const intent = parseIntent(q);
    const taskType = forceTaskType || intent.taskType;
    
    // If it's a general query, use the AI query endpoint
    if (taskType === "query") {
      setIsLoading(true);
      let fullQuery = q;
      if (context) {
        fullQuery = `[Context: ${context.type}${context.name ? ` - ${context.name}` : ""}${context.id ? ` (ID: ${context.id})` : ""}]\n\n${q}`;
      }
      aiQuery.mutate({ question: fullQuery });
      return;
    }
    
    // Handle entity creation tasks - open quick create dialogs
    if (taskType === "create_vendor") {
      setShowQuickCreateVendor(true);
      return;
    }
    if (taskType === "create_material") {
      setShowQuickCreateMaterial(true);
      return;
    }
    if (taskType === "create_product") {
      setShowQuickCreateProduct(true);
      return;
    }
    if (taskType === "create_customer") {
      setShowQuickCreateCustomer(true);
      return;
    }
    
    // Handle invoice creation with natural language
    if (taskType === "generate_invoice") {
      setIsLoading(true);
      createInvoiceFromText.mutate({ text: q });
      return;
    }
    
    // Handle purchase order creation with natural language
    if (taskType === "generate_po" && q.includes("from") || q.includes("to") || q.includes("vendor")) {
      setIsLoading(true);
      createPOFromText.mutate({ text: q });
      return;
    }
    
    // Handle shipment tracking with natural language
    if (taskType === "create_shipment") {
      setIsLoading(true);
      createShipmentFromText.mutate({ text: q });
      return;
    }
    
    // Handle payment recording with natural language
    if (taskType === "reconcile_payment") {
      setIsLoading(true);
      recordPaymentFromText.mutate({ text: q });
      return;
    }
    
    // Handle work order creation with natural language
    if (taskType === "create_work_order") {
      setIsLoading(true);
      createWorkOrderFromText.mutate({ text: q });
      return;
    }
    
    // Handle inventory transfer with natural language
    if (taskType === "update_inventory") {
      setIsLoading(true);
      transferInventoryFromText.mutate({ text: q });
      return;
    }
    
    // For actionable tasks, show draft preview first
    const material = vendorSuggestion?.material || selectedMaterial;
    const vendor = selectedVendorId 
      ? vendorsQuery.data?.find(v => v.id === selectedVendorId) || null
      : vendorSuggestion?.suggestedVendor 
        ? { id: vendorSuggestion.suggestedVendor.id, name: vendorSuggestion.suggestedVendor.name, email: vendorSuggestion.suggestedVendor.email }
        : vendorSuggestion?.preferredVendor
          ? { id: vendorSuggestion.preferredVendor.id, name: vendorSuggestion.preferredVendor.name, email: null }
          : null;
    
    const parsedQty = intent.taskData?.quantity || null;
    const parsedDate = intent.taskData?.requiredDate ? new Date(intent.taskData.requiredDate) : null;
    const lastPrice = vendorSuggestion?.lastPurchasePrice ? parseFloat(vendorSuggestion.lastPurchasePrice) : null;
    const estimatedPrice = parsedQty && lastPrice ? parsedQty * lastPrice : null;
    
    setDraftData({
      taskType,
      material: material ? { id: material.id, name: material.name, sku: material.sku || null, unit: material.unit || null } : null,
      vendor: vendor ? { id: vendor.id, name: vendor.name, email: vendor.email || null } : null,
      quantity: parsedQty,
      unit: intent.taskData?.unit || material?.unit || null,
      requiredDate: parsedDate,
      estimatedPrice,
      originalQuery: q
    });
    setEditingQuantity(parsedQty?.toString() || "");
    setEditingDate(parsedDate ? parsedDate.toISOString().split('T')[0] : "");
    setShowDraftPreview(true);
  }, [context, aiQuery, vendorSuggestion, selectedVendorId, vendorsQuery.data, selectedMaterial]);

  // Submit the draft after preview/editing
  const handleSubmitDraft = useCallback(async () => {
    if (!draftData) return;
    setIsLoading(true);
    
    try {
      const taskDataWithVendor = {
        originalQuery: draftData.originalQuery,
        context: context ? {
          type: context.type,
          id: context.id,
          name: context.name
        } : null,
        // Material info
        ...(draftData.material && {
          materialId: draftData.material.id,
          materialName: draftData.material.name,
          materialSku: draftData.material.sku,
          materialUnit: draftData.material.unit,
        }),
        // Vendor info
        ...(draftData.vendor && {
          vendorId: draftData.vendor.id,
          vendorName: draftData.vendor.name,
          vendorEmail: draftData.vendor.email,
        }),
        // Quantity and date from editing
        quantity: editingQuantity ? parseFloat(editingQuantity) : draftData.quantity,
        unit: draftData.unit,
        requiredDate: editingDate || (draftData.requiredDate ? draftData.requiredDate.toISOString() : null),
        estimatedPrice: draftData.estimatedPrice,
        needsVendorSelection: !draftData.vendor,
      };
      
      await createTask.mutateAsync({
        taskType: draftData.taskType,
        priority: "medium",
        taskData: JSON.stringify(taskDataWithVendor)
      });
      setShowDraftPreview(false);
      setDraftData(null);
    } catch (error) {
      // Error handled by mutation onError
    }
  }, [draftData, context, createTask, editingQuantity, editingDate]);

  const filteredActions = quickActions.filter(action => 
    !context || action.context.some(c => context.type.toLowerCase().includes(c))
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden">
        <div className="flex items-center border-b px-4 py-3">
          <Bot className="h-5 w-5 text-primary mr-3" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(query);
              }
            }}
            placeholder={context ? `Ask about ${context.name || context.type}...` : "Ask AI or create a task... (⌘K)"}
            className="border-0 focus-visible:ring-0 text-base flex-1"
          />
          {query && (
            <Button
              size="sm"
              onClick={() => handleSubmit(query)}
              disabled={isLoading}
              className="ml-2"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          )}
        </div>

        {context && (
          <div className="px-4 py-2 bg-muted/50 border-b flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {context.type}
            </Badge>
            {context.name && (
              <span className="text-sm text-muted-foreground">{context.name}</span>
            )}
          </div>
        )}

        {/* Vendor Suggestion Display */}
        {vendorSuggestion?.material && !isLoading && !taskCreated && !response && (
          <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
            <div className="flex items-start gap-3">
              <Package className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-blue-900">{vendorSuggestion.material.name}</span>
                  {vendorSuggestion.material.sku && (
                    <Badge variant="outline" className="text-xs">{vendorSuggestion.material.sku}</Badge>
                  )}
                </div>
                
                {/* Vendor Suggestion */}
                {vendorSuggestion.suggestedVendor ? (
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <Building className="h-4 w-4 text-green-600" />
                    <span className="text-green-700 font-medium">
                      Suggested: {vendorSuggestion.suggestedVendor.name}
                    </span>
                    <span className="text-muted-foreground">
                      ({vendorSuggestion.suggestedVendor.poCount} past POs)
                    </span>
                  </div>
                ) : vendorSuggestion.preferredVendor ? (
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <Building className="h-4 w-4 text-blue-600" />
                    <span className="text-blue-700 font-medium">
                      Preferred: {vendorSuggestion.preferredVendor.name}
                    </span>
                  </div>
                ) : (
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-2 text-sm text-amber-600">
                      <AlertCircle className="h-4 w-4" />
                      <span>No vendor history found</span>
                    </div>
                    {/* Vendor Selection Dropdown */}
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedVendorId || ''}
                        onChange={(e) => {
                          setSelectedVendorId(e.target.value ? Number(e.target.value) : null);
                        }}
                        onFocus={() => setShowVendorDropdown(true)}
                        className="flex-1 px-3 py-1.5 text-sm border rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select a vendor...</option>
                        {vendorsQuery.data?.map((vendor) => (
                          <option key={vendor.id} value={vendor.id}>
                            {vendor.name}
                          </option>
                        ))}
                      </select>
                      {selectedVendorId && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelectedVendorId(null)}
                          className="h-8 w-8 p-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {selectedVendorId && (
                      <div className="flex items-center gap-2 text-sm text-green-600">
                        <CheckCircle className="h-4 w-4" />
                        <span>Vendor selected: {vendorsQuery.data?.find(v => v.id === selectedVendorId)?.name}</span>
                      </div>
                    )}
                    {!selectedVendorId && (
                      <p className="text-xs text-muted-foreground">
                        You can proceed without selecting a vendor - the PO will be created as a draft.
                      </p>
                    )}
                  </div>
                )}

                {/* Last Purchase Price */}
                {vendorSuggestion.lastPurchasePrice && (
                  <div className="mt-1 text-sm text-muted-foreground">
                    Last price: ${parseFloat(vendorSuggestion.lastPurchasePrice).toFixed(2)}/{vendorSuggestion.material.unit || 'unit'}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <ScrollArea className="max-h-[60vh]">
          {isLoading && (
            <div className="p-6 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary mr-3" />
              <span className="text-muted-foreground">Processing...</span>
            </div>
          )}

          {taskCreated && !isLoading && (
            <div className="p-4">
              <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="h-6 w-6 text-green-600" />
                <div className="flex-1">
                  <p className="font-medium text-green-800">AI Task Created</p>
                  <p className="text-sm text-green-600">
                    {taskCreated.status === "pending_approval" 
                      ? "Task is awaiting approval in the Approval Queue" 
                      : "Task has been queued for execution"}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setLocation("/ai/approvals");
                    onOpenChange(false);
                  }}
                >
                  View Queue
                </Button>
              </div>
              <div className="mt-4 flex gap-2 flex-wrap">
                {/* Quick navigation based on task type */}
                {taskCreated.taskType === "generate_po" && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      setLocation("/procurement");
                      onOpenChange(false);
                    }}
                  >
                    <ArrowRight className="h-4 w-4 mr-1" /> Go to Purchase Orders
                  </Button>
                )}
                {taskCreated.taskType === "send_rfq" && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      setLocation("/logistics");
                      onOpenChange(false);
                    }}
                  >
                    <ArrowRight className="h-4 w-4 mr-1" /> Go to Freight RFQs
                  </Button>
                )}
                {taskCreated.taskType === "create_vendor" && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      setLocation("/procurement");
                      onOpenChange(false);
                    }}
                  >
                    <ArrowRight className="h-4 w-4 mr-1" /> Go to Vendors
                  </Button>
                )}
                {taskCreated.taskType === "create_material" && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      setLocation("/procurement");
                      onOpenChange(false);
                    }}
                  >
                    <ArrowRight className="h-4 w-4 mr-1" /> Go to Raw Materials
                  </Button>
                )}
                {taskCreated.taskType === "create_product" && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      setLocation("/sales");
                      onOpenChange(false);
                    }}
                  >
                    <ArrowRight className="h-4 w-4 mr-1" /> Go to Products
                  </Button>
                )}
                {taskCreated.taskType === "create_customer" && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      setLocation("/sales");
                      onOpenChange(false);
                    }}
                  >
                    <ArrowRight className="h-4 w-4 mr-1" /> Go to Customers
                  </Button>
                )}
                {taskCreated.taskType === "create_work_order" && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      setLocation("/manufacturing");
                      onOpenChange(false);
                    }}
                  >
                    <ArrowRight className="h-4 w-4 mr-1" /> Go to Work Orders
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTaskCreated(null);
                    setShowSuggestions(true);
                    setQuery("");
                  }}
                >
                  <X className="h-4 w-4 mr-1" /> New Task
                </Button>
              </div>
            </div>
          )}

          {/* Draft Preview Panel */}
          {showDraftPreview && draftData && !isLoading && !taskCreated && (
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="h-5 w-5 text-blue-600" />
                <h3 className="font-semibold text-lg">Review Draft {draftData.taskType === 'generate_po' ? 'Purchase Order' : draftData.taskType === 'send_rfq' ? 'RFQ' : 'Task'}</h3>
              </div>
              
              <div className="bg-slate-50 rounded-lg p-4 space-y-4">
                {/* Material Selection */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                    <Package className="h-4 w-4" /> Material
                    {!draftData.material && <span className="text-red-500 text-xs">* Required</span>}
                  </label>
                  {draftData.material ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 px-3 py-2 bg-white border rounded-md">
                        <span className="font-medium">{draftData.material.name}</span>
                        {draftData.material.sku && <span className="text-muted-foreground ml-2">({draftData.material.sku})</span>}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setDraftData({ ...draftData, material: null });
                          setShowMaterialDropdown(true);
                          setMaterialSearch("");
                        }}
                      >
                        Change
                      </Button>
                    </div>
                  ) : (
                    <div className="relative">
                      <Input
                        placeholder="Search for a material..."
                        value={materialSearch}
                        onChange={(e) => {
                          setMaterialSearch(e.target.value);
                          setShowMaterialDropdown(true);
                        }}
                        onFocus={() => setShowMaterialDropdown(true)}
                        className="bg-white"
                      />
                      {showMaterialDropdown && filteredMaterials.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-auto">
                          {filteredMaterials.map((m) => (
                            <button
                              key={m.id}
                              className="w-full px-3 py-2 text-left hover:bg-slate-100 flex items-center justify-between"
                              onClick={() => {
                                setDraftData({ 
                                  ...draftData, 
                                  material: { id: m.id, name: m.name, sku: m.sku || null, unit: m.unit || null },
                                  unit: m.unit || draftData.unit
                                });
                                setShowMaterialDropdown(false);
                                setMaterialSearch("");
                              }}
                            >
                              <span>{m.name}</span>
                              {m.sku && <span className="text-xs text-muted-foreground">{m.sku}</span>}
                            </button>
                          ))}
                          {/* Create New option at bottom */}
                          <button
                            className="w-full px-3 py-2 text-left hover:bg-blue-50 flex items-center gap-2 border-t text-blue-600 font-medium"
                            onClick={() => {
                              setShowMaterialDropdown(false);
                              setShowQuickCreateMaterial(true);
                            }}
                          >
                            <Package className="h-4 w-4" /> + Create New Material
                          </button>
                        </div>
                      )}
                      {showMaterialDropdown && materialSearch.length > 0 && filteredMaterials.length === 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg p-3">
                          <p className="text-sm text-muted-foreground mb-2">No materials found matching "{materialSearch}"</p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full"
                            onClick={() => {
                              setShowMaterialDropdown(false);
                              setShowQuickCreateMaterial(true);
                            }}
                          >
                            <Package className="h-4 w-4 mr-1" /> Create "{materialSearch}" as new material
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Vendor Selection */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                    <Building className="h-4 w-4" /> Vendor
                    {!draftData.vendor && <span className="text-amber-500 text-xs">(Optional - can be assigned later)</span>}
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={draftData.vendor?.id || ''}
                      onChange={(e) => {
                        const vendorId = e.target.value ? Number(e.target.value) : null;
                        const vendor = vendorId ? vendorsQuery.data?.find(v => v.id === vendorId) : null;
                        setDraftData({
                          ...draftData,
                          vendor: vendor ? { id: vendor.id, name: vendor.name, email: vendor.email || null } : null
                        });
                      }}
                      className="flex-1 px-3 py-2 border rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select a vendor (optional)...</option>
                      {vendorsQuery.data?.map((vendor) => (
                        <option key={vendor.id} value={vendor.id}>
                          {vendor.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowQuickCreateVendor(true)}
                      title="Create new vendor"
                    >
                      <Building className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Quantity */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                    <ClipboardList className="h-4 w-4" /> Quantity
                    {!editingQuantity && <span className="text-red-500 text-xs">* Required</span>}
                  </label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      placeholder="Enter quantity"
                      value={editingQuantity}
                      onChange={(e) => setEditingQuantity(e.target.value)}
                      className="bg-white flex-1"
                    />
                    <span className="text-sm text-muted-foreground w-20">
                      {draftData.unit || 'units'}
                    </span>
                  </div>
                </div>

                {/* Required Date */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                    <Clock className="h-4 w-4" /> Required By
                    <span className="text-muted-foreground text-xs">(Optional)</span>
                  </label>
                  <Input
                    type="date"
                    value={editingDate}
                    onChange={(e) => setEditingDate(e.target.value)}
                    className="bg-white"
                  />
                </div>

                {/* Estimated Price */}
                {draftData.estimatedPrice && (
                  <div className="pt-2 border-t">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Estimated Total:</span>
                      <span className="font-semibold text-lg">${draftData.estimatedPrice.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Validation Messages */}
              {(!draftData.material || !editingQuantity) && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-amber-800">Missing required information:</p>
                      <ul className="mt-1 text-amber-700 list-disc list-inside">
                        {!draftData.material && <li>Please select a material</li>}
                        {!editingQuantity && <li>Please enter a quantity</li>}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDraftPreview(false);
                    setDraftData(null);
                    setShowSuggestions(true);
                  }}
                >
                  <X className="h-4 w-4 mr-1" /> Cancel
                </Button>
                <Button
                  onClick={handleSubmitDraft}
                  disabled={!draftData.material || !editingQuantity || isLoading}
                  className="flex-1"
                >
                  {isLoading ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting...</>
                  ) : (
                    <><Send className="h-4 w-4 mr-2" /> Submit for Approval</>
                  )}
                </Button>
              </div>
            </div>
          )}

          {response && !isLoading && !taskCreated && (
            <div className="p-4">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <Streamdown>{response}</Streamdown>
              </div>
              <div className="mt-4 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setResponse(null);
                    setShowSuggestions(true);
                    setQuery("");
                  }}
                >
                  <X className="h-4 w-4 mr-1" /> Clear
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(response);
                    toast.success("Copied to clipboard");
                  }}
                >
                  Copy response
                </Button>
              </div>
            </div>
          )}

          {showSuggestions && !isLoading && !response && !taskCreated && (
            <div className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">
                <Sparkles className="h-3 w-3 inline mr-1" />
                Quick Actions
              </p>
              <div className="space-y-1">
                {filteredActions.map((action, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setQuery(action.query);
                      handleSubmit(action.query, action.taskType);
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted text-left transition-colors group"
                  >
                    <action.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                    <span className="flex-1 text-sm">{action.label}</span>
                    {action.taskType !== "query" && (
                      <Badge variant="outline" className="text-xs">
                        <Clock className="h-3 w-3 mr-1" />
                        Task
                      </Badge>
                    )}
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>

              <div className="mt-6 pt-4 border-t">
                <p className="text-xs text-muted-foreground mb-2">
                  <Command className="h-3 w-3 inline mr-1" />
                  Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">⌘K</kbd> anywhere to open
                </p>
                <p className="text-xs text-muted-foreground">
                  💡 Try: "Generate PO for 100 units of mushrooms" or "Send RFQ to freight vendors"
                </p>
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>

      {/* Quick Create Dialogs */}
      <QuickCreateDialog
        open={showQuickCreateVendor}
        onOpenChange={setShowQuickCreateVendor}
        entityType="vendor"
        onCreated={(vendor) => {
          // Auto-select the newly created vendor in the draft
          if (draftData) {
            setDraftData({
              ...draftData,
              vendor: { id: vendor.id, name: vendor.name, email: vendor.email || null }
            });
          }
          utils.vendors.list.invalidate();
          toast.success(
            <div className="flex items-center gap-2">
              <span>Vendor "{vendor.name}" created!</span>
              <button
                className="text-blue-600 hover:underline font-medium"
                onClick={() => {
                  setLocation("/procurement");
                  onOpenChange(false);
                }}
              >
                View in Procurement
              </button>
            </div>
          );
        }}
      />
      <QuickCreateDialog
        open={showQuickCreateMaterial}
        onOpenChange={setShowQuickCreateMaterial}
        entityType="material"
        defaultValues={{ name: materialSearch }}
        onCreated={(material) => {
          // Auto-select the newly created material in the draft
          if (draftData) {
            setDraftData({
              ...draftData,
              material: { id: material.id, name: material.name, sku: material.sku || null, unit: material.unit || null },
              unit: material.unit || draftData.unit
            });
          }
          setMaterialSearch("");
          utils.rawMaterials.list.invalidate();
          toast.success(
            <div className="flex items-center gap-2">
              <span>Material "{material.name}" created!</span>
              <button
                className="text-blue-600 hover:underline font-medium"
                onClick={() => {
                  setLocation("/procurement");
                  onOpenChange(false);
                }}
              >
                View in Procurement
              </button>
            </div>
          );
        }}
      />
      <QuickCreateDialog
        open={showQuickCreateProduct}
        onOpenChange={setShowQuickCreateProduct}
        entityType="product"
        onCreated={(product) => {
          utils.products.list.invalidate();
          toast.success(
            <div className="flex items-center gap-2">
              <span>Product created!</span>
              <button
                className="text-blue-600 hover:underline font-medium"
                onClick={() => {
                  setLocation("/sales");
                  onOpenChange(false);
                }}
              >
                View in Sales Hub
              </button>
            </div>
          );
        }}
      />
      <QuickCreateDialog
        open={showQuickCreateCustomer}
        onOpenChange={setShowQuickCreateCustomer}
        entityType="customer"
        onCreated={(customer) => {
          utils.customers.list.invalidate();
          toast.success(
            <div className="flex items-center gap-2">
              <span>Customer created!</span>
              <button
                className="text-blue-600 hover:underline font-medium"
                onClick={() => {
                  setLocation("/sales");
                  onOpenChange(false);
                }}
              >
                View in Sales Hub
              </button>
            </div>
          );
        }}
      />
    </Dialog>
  );
}

// Floating AI button for pages
export function AIFloatingButton({ context }: { context?: AICommandBarProps["context"] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="sm"
        variant="outline"
        className="fixed bottom-6 right-6 shadow-lg hover:shadow-xl transition-all z-50 gap-2"
      >
        <Bot className="h-4 w-4" />
        <span className="hidden sm:inline">Ask AI</span>
        <kbd className="hidden sm:inline px-1.5 py-0.5 bg-muted rounded text-xs">⌘K</kbd>
      </Button>
      <AICommandBar open={open} onOpenChange={setOpen} context={context} />
    </>
  );
}

// Inline AI input for list views
export function AIInlineInput({ 
  context, 
  placeholder = "Ask AI about this data...",
  className = ""
}: { 
  context?: AICommandBarProps["context"];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div 
        onClick={() => setOpen(true)}
        className={`flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors ${className}`}
      >
        <Bot className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground flex-1">{placeholder}</span>
        <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs text-muted-foreground">⌘K</kbd>
      </div>
      <AICommandBar open={open} onOpenChange={setOpen} context={context} />
    </>
  );
}
