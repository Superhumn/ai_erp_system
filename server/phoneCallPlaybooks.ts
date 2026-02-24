import { getDb } from "./db";
import { aiPhoneCallPlaybooks } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// ============================================
// PHONE CALL PLAYBOOKS
// Pre-built knowledge for calling common vendors
// Similar to Pine AI's approach
// ============================================

export interface PlaybookTemplate {
  playbookKey: string;
  name: string;
  description: string;
  targetCompany: string;
  phoneNumber: string;
  department: string;
  operatingHours: string;
  ivrInstructions: object;
  openingScript: string;
  objectivePrompts: object;
  closingScript: string;
  requiredAccountInfo: object;
  typicalQuestions: object;
  escalationTriggers: object;
  maxCallDuration: number;
}

// ============================================
// BUILT-IN PLAYBOOK TEMPLATES
// ============================================

export const PLAYBOOK_TEMPLATES: PlaybookTemplate[] = [
  // UPS
  {
    playbookKey: "ups_claims",
    name: "UPS - File/Follow Up on Claim",
    description: "File a damage or lost package claim with UPS, or follow up on an existing claim. Covers both domestic and international shipments.",
    targetCompany: "UPS",
    phoneNumber: "1-800-742-5877",
    department: "Claims Department",
    operatingHours: "Mon-Fri 8am-8pm EST",
    ivrInstructions: {
      steps: [
        { step: 1, prompt: "Main menu", action: "Say 'Claims' or press 4" },
        { step: 2, prompt: "Claims sub-menu", action: "Say 'File a claim' or 'Check claim status'" },
        { step: 3, prompt: "Account verification", action: "Provide UPS account number when asked" },
        { step: 4, prompt: "Representative", action: "Wait to be connected to a claims specialist" },
      ],
    },
    openingScript: "Hello, my name is [Agent Name] and I'm calling on behalf of [Company Name], account number [Account Number]. I need to file a claim for a damaged/lost package.",
    objectivePrompts: {
      file_claim: "I need to file a claim for tracking number [Tracking Number]. The package was [damaged/lost] and the declared value is [Amount].",
      check_status: "I'm calling to check the status of claim number [Claim Number] filed on [Date].",
      escalate_claim: "I'd like to escalate claim [Claim Number] as it has been [X days] without resolution.",
    },
    closingScript: "Thank you for your help. Can you please provide me with a claim reference number and the expected timeline for resolution?",
    requiredAccountInfo: {
      required: ["UPS Account Number", "Tracking Number", "Ship Date"],
      helpful: ["Declared Value", "Package Contents Description", "Receiver Name/Address"],
    },
    typicalQuestions: {
      verification: ["Account number", "Shipper name", "Shipping address"],
      claim_details: ["Tracking number", "Description of damage/loss", "Estimated value", "Date shipped"],
    },
    escalationTriggers: {
      triggers: [
        "Representative refuses to process claim",
        "System is down or cannot look up tracking",
        "Being asked to provide information we don't have",
        "Call has exceeded 20 minutes without progress",
        "Representative asks to speak with the account holder directly",
      ],
    },
    maxCallDuration: 1800, // 30 minutes
  },

  {
    playbookKey: "ups_trace",
    name: "UPS - Package Trace/Investigation",
    description: "Initiate a package trace or investigation for delayed, missing, or undelivered shipments with UPS.",
    targetCompany: "UPS",
    phoneNumber: "1-800-742-5877",
    department: "Package Tracking",
    operatingHours: "Mon-Fri 8am-8pm EST",
    ivrInstructions: {
      steps: [
        { step: 1, prompt: "Main menu", action: "Say 'Track a package' or press 1" },
        { step: 2, prompt: "Tracking number", action: "Enter the tracking number" },
        { step: 3, prompt: "More options", action: "Say 'Speak to an agent' or press 0" },
      ],
    },
    openingScript: "Hello, I'm calling on behalf of [Company Name], account [Account Number]. I need to initiate a trace for a package that appears to be [delayed/lost/undelivered].",
    objectivePrompts: {
      trace_package: "Tracking number [Tracking] shows [status] but the package was expected by [Date]. I need to initiate a trace investigation.",
      delivery_issue: "The tracking shows delivered but the recipient at [Address] has not received the package. I need a delivery investigation.",
    },
    closingScript: "Thank you. Please provide the investigation reference number and expected timeline for the trace results.",
    requiredAccountInfo: {
      required: ["UPS Account Number", "Tracking Number"],
      helpful: ["Expected Delivery Date", "Receiver Contact Info", "Package Description"],
    },
    typicalQuestions: {
      verification: ["Account number", "Shipper details"],
      trace_details: ["Last known status", "Expected delivery date", "Receiver has been contacted?"],
    },
    escalationTriggers: {
      triggers: [
        "Agent cannot locate the package in system",
        "Being told to wait 24-48 hours when already waited",
        "Request for information not available",
      ],
    },
    maxCallDuration: 1200,
  },

  // FedEx
  {
    playbookKey: "fedex_claims",
    name: "FedEx - File/Follow Up on Claim",
    description: "File a damage, loss, or delay claim with FedEx. Handles the claims process from initiation to reference number collection.",
    targetCompany: "FedEx",
    phoneNumber: "1-800-463-3339",
    department: "Claims Department",
    operatingHours: "Mon-Fri 7am-9pm EST, Sat 7am-5pm EST",
    ivrInstructions: {
      steps: [
        { step: 1, prompt: "Main menu", action: "Say 'Claims' or press 5" },
        { step: 2, prompt: "Claims menu", action: "Say 'File a new claim' or 'Existing claim'" },
        { step: 3, prompt: "Verification", action: "Provide FedEx account number" },
      ],
    },
    openingScript: "Hi, I'm calling on behalf of [Company Name], account number [Account Number]. I need to [file a claim / follow up on claim [Claim Number]].",
    objectivePrompts: {
      file_claim: "I need to file a claim for tracking [Tracking Number]. The shipment was [damaged/lost/delayed] and the value is [Amount].",
      check_claim: "I'm following up on claim [Claim Number]. Can you provide the current status?",
    },
    closingScript: "Please provide the claim reference number and let me know what documentation you need from us.",
    requiredAccountInfo: {
      required: ["FedEx Account Number", "Tracking Number"],
      helpful: ["Invoice/Commercial Invoice", "Package Value", "Contents Description"],
    },
    typicalQuestions: {
      verification: ["Account number", "Company name", "Callback number"],
      claim_details: ["Tracking number", "Ship date", "Package value", "Damage description"],
    },
    escalationTriggers: {
      triggers: [
        "Claim denied without valid reason",
        "Documentation requirements seem excessive",
        "Call exceeds 25 minutes",
        "Being transferred multiple times",
      ],
    },
    maxCallDuration: 1800,
  },

  {
    playbookKey: "fedex_trace",
    name: "FedEx - Package Trace/Delivery Issue",
    description: "Request a trace or report delivery issues with FedEx shipments.",
    targetCompany: "FedEx",
    phoneNumber: "1-800-463-3339",
    department: "Tracking & Tracing",
    operatingHours: "24/7",
    ivrInstructions: {
      steps: [
        { step: 1, prompt: "Main menu", action: "Say 'Track a package'" },
        { step: 2, prompt: "Tracking number", action: "Say or enter the tracking number" },
        { step: 3, prompt: "Options", action: "Say 'Representative'" },
      ],
    },
    openingScript: "Hello, I'm with [Company Name], account [Account Number]. I need help with a [delayed/missing] FedEx shipment.",
    objectivePrompts: {
      trace: "Tracking [Tracking Number] shows [status] but hasn't been delivered. Estimated delivery was [Date]. Please initiate a trace.",
      redeliver: "Tracking [Tracking Number] shows a delivery attempt but the package was not left. I need to schedule a redelivery.",
    },
    closingScript: "Thank you. Can I get a reference number for this trace and the expected response time?",
    requiredAccountInfo: {
      required: ["FedEx Account Number", "Tracking Number"],
      helpful: ["Ship Date", "Destination Address"],
    },
    typicalQuestions: {
      verification: ["Account number", "Shipper name"],
      trace_details: ["Last known location", "Expected delivery", "Is someone at delivery address?"],
    },
    escalationTriggers: {
      triggers: [
        "Package lost in transit over 5 days",
        "Multiple failed delivery attempts",
        "Agent cannot locate tracking info",
      ],
    },
    maxCallDuration: 1200,
  },

  // USPS
  {
    playbookKey: "usps_inquiry",
    name: "USPS - Package Inquiry & Missing Mail",
    description: "Report missing packages or inquire about delayed mail with USPS customer service.",
    targetCompany: "USPS",
    phoneNumber: "1-800-275-8777",
    department: "Package Inquiry",
    operatingHours: "Mon-Fri 8am-8:30pm EST, Sat 8am-6pm EST",
    ivrInstructions: {
      steps: [
        { step: 1, prompt: "Language selection", action: "Press 1 for English" },
        { step: 2, prompt: "Main menu", action: "Say 'Track a package' or press 1" },
        { step: 3, prompt: "Tracking", action: "Enter tracking number, then press 0 for representative" },
      ],
    },
    openingScript: "Hello, I'm calling from [Company Name]. I need to report a [missing/delayed] package, tracking number [Tracking Number].",
    objectivePrompts: {
      missing_package: "Package [Tracking Number] was shipped on [Date] and tracking hasn't updated since [Last Update]. I need to file a missing mail search request.",
      delayed_delivery: "Package [Tracking Number] shows [status] but was expected by [Date]. What's causing the delay?",
    },
    closingScript: "Thank you. Can you provide me with a case number for this inquiry?",
    requiredAccountInfo: {
      required: ["Tracking Number"],
      helpful: ["Ship Date", "Destination ZIP Code", "Package Description"],
    },
    typicalQuestions: {
      verification: ["Tracking number", "Sender information"],
      inquiry_details: ["Ship date", "Last tracking update", "Package contents and value"],
    },
    escalationTriggers: {
      triggers: [
        "Being told to just wait without investigation",
        "Package value exceeds insurance limit",
        "No tracking updates for 7+ days",
      ],
    },
    maxCallDuration: 1200,
  },

  // DHL
  {
    playbookKey: "dhl_inquiry",
    name: "DHL - Shipment Inquiry & Customs",
    description: "Handle shipment inquiries, customs holds, and delivery issues with DHL Express.",
    targetCompany: "DHL Express",
    phoneNumber: "1-800-225-5345",
    department: "Customer Service",
    operatingHours: "Mon-Fri 7am-9pm EST",
    ivrInstructions: {
      steps: [
        { step: 1, prompt: "Main menu", action: "Press 2 for existing shipment" },
        { step: 2, prompt: "Waybill number", action: "Enter the waybill/tracking number" },
        { step: 3, prompt: "Options", action: "Press 0 for representative" },
      ],
    },
    openingScript: "Hello, I'm calling from [Company Name], account [Account Number]. I need help with DHL waybill number [Tracking Number].",
    objectivePrompts: {
      customs_hold: "Waybill [Tracking Number] is held at customs. What documentation do you need to clear it?",
      delivery_issue: "I need to resolve a delivery issue for waybill [Tracking Number].",
      rate_inquiry: "I'd like to discuss rates for regular shipments from [Origin] to [Destination].",
    },
    closingScript: "Thank you for your assistance. Can you email the details to [Email] and provide a reference number?",
    requiredAccountInfo: {
      required: ["DHL Account Number", "Waybill/Tracking Number"],
      helpful: ["Commercial Invoice", "Customs Docs", "HS Codes"],
    },
    typicalQuestions: {
      verification: ["Account number", "Company name", "Waybill number"],
      shipment_details: ["Origin/destination", "Contents", "Declared value", "Customs status"],
    },
    escalationTriggers: {
      triggers: [
        "Customs issue requires broker coordination",
        "Duties/taxes dispute",
        "Package held over 5 business days",
      ],
    },
    maxCallDuration: 1200,
  },

  // Amazon Seller Support
  {
    playbookKey: "amazon_seller",
    name: "Amazon - Seller Support Issue",
    description: "Handle account issues, listing problems, FBA inquiries, and reimbursement requests with Amazon Seller Support.",
    targetCompany: "Amazon Seller Support",
    phoneNumber: "1-888-280-4331",
    department: "Seller Support",
    operatingHours: "24/7",
    ivrInstructions: {
      steps: [
        { step: 1, prompt: "Language", action: "Press 1 for English" },
        { step: 2, prompt: "Account type", action: "Press 1 for Seller" },
        { step: 3, prompt: "Issue type", action: "Follow prompts based on issue category" },
      ],
    },
    openingScript: "Hello, I'm calling from [Company Name] regarding seller account [Merchant ID]. I need help with [issue description].",
    objectivePrompts: {
      fba_issue: "I have an FBA inventory discrepancy for ASIN [ASIN]. Our records show [X] units but Amazon shows [Y]. I need a reimbursement investigation.",
      listing_issue: "ASIN [ASIN] has been suppressed/deactivated. I need to understand why and get it reinstated.",
      account_issue: "I need to resolve an account health issue related to [metric/policy].",
    },
    closingScript: "Please provide the case ID and expected resolution timeline. Can you also send a summary to [Email]?",
    requiredAccountInfo: {
      required: ["Seller/Merchant ID", "ASIN (if product-specific)"],
      helpful: ["Order ID", "FBA Shipment ID", "Case ID (for follow-ups)"],
    },
    typicalQuestions: {
      verification: ["Merchant ID", "Registered email", "Phone on file"],
      issue_details: ["ASIN", "Order number", "Specific error message", "When issue started"],
    },
    escalationTriggers: {
      triggers: [
        "Account suspension or deactivation",
        "Reimbursement denied without clear reason",
        "Being given conflicting information",
        "Unable to reach relevant department",
      ],
    },
    maxCallDuration: 2400,
  },

  // Generic vendor/supplier
  {
    playbookKey: "vendor_general",
    name: "General Vendor - Customer Service Call",
    description: "Template for calling any vendor's customer service for general inquiries, complaints, billing, or account issues.",
    targetCompany: "Generic Vendor",
    phoneNumber: "",
    department: "Customer Service",
    operatingHours: "Business hours (varies)",
    ivrInstructions: {
      steps: [
        { step: 1, prompt: "Language selection", action: "Press 1 for English" },
        { step: 2, prompt: "Main menu", action: "Listen to options, select the most relevant" },
        { step: 3, prompt: "Sub-menu", action: "Press 0 or say 'Representative' to reach a person" },
      ],
    },
    openingScript: "Hello, my name is [Agent Name] and I'm calling from [Company Name]. Our account number is [Account Number]. I'm calling about [Subject].",
    objectivePrompts: {
      billing_inquiry: "I have a question about invoice [Invoice Number] dated [Date]. The amount of [Amount] doesn't match our records.",
      complaint: "I need to file a complaint regarding [issue]. This has been affecting our operations since [date].",
      general_inquiry: "I need information about [topic] for our account.",
    },
    closingScript: "Thank you for your help. Can you provide a reference or ticket number for this call? And what's the best number to call back if we need to follow up?",
    requiredAccountInfo: {
      required: ["Account Number or Customer ID"],
      helpful: ["Invoice Number", "Order Number", "Contact Name on File"],
    },
    typicalQuestions: {
      verification: ["Account number", "Company name", "Authorized contact"],
      issue_details: ["Description of issue", "When it started", "Previous interactions about this"],
    },
    escalationTriggers: {
      triggers: [
        "Representative cannot resolve the issue",
        "Being transferred more than 3 times",
        "Call exceeds 30 minutes without progress",
        "Asked to provide information we don't have",
        "Legal or contract-related questions arise",
      ],
    },
    maxCallDuration: 1800,
  },

  // Utility Company
  {
    playbookKey: "utility_billing",
    name: "Utility Company - Billing Inquiry",
    description: "Handle billing disputes, service inquiries, and account management calls with utility providers.",
    targetCompany: "Utility Provider",
    phoneNumber: "",
    department: "Billing",
    operatingHours: "Mon-Fri 8am-6pm local time",
    ivrInstructions: {
      steps: [
        { step: 1, prompt: "Account number", action: "Enter account number" },
        { step: 2, prompt: "Main menu", action: "Press 2 for Billing" },
        { step: 3, prompt: "Billing options", action: "Press 0 for representative" },
      ],
    },
    openingScript: "Hello, I'm calling from [Company Name] regarding account [Account Number] at [Service Address]. I have a billing question.",
    objectivePrompts: {
      dispute_charge: "I'm disputing a charge of [Amount] on our [Month] bill. The normal charge is approximately [Normal Amount].",
      service_inquiry: "I need to inquire about [adding/changing/canceling] service at [Address].",
    },
    closingScript: "Thank you. Can you provide a confirmation number and send an updated statement to [Email]?",
    requiredAccountInfo: {
      required: ["Account Number", "Service Address"],
      helpful: ["Previous Bill Amount", "Meter Number"],
    },
    typicalQuestions: {
      verification: ["Account number", "Service address", "Name on account"],
      billing_details: ["Billing period in question", "Expected vs actual amount", "Meter readings"],
    },
    escalationTriggers: {
      triggers: [
        "Billing error exceeds $500",
        "Service disconnection threat",
        "Regulatory/compliance issues",
      ],
    },
    maxCallDuration: 1200,
  },

  // Insurance
  {
    playbookKey: "insurance_claim",
    name: "Insurance - File/Check Claim Status",
    description: "File new insurance claims or check status of existing claims for business insurance.",
    targetCompany: "Insurance Provider",
    phoneNumber: "",
    department: "Claims",
    operatingHours: "Mon-Fri 8am-6pm local time",
    ivrInstructions: {
      steps: [
        { step: 1, prompt: "Main menu", action: "Press 1 for Claims" },
        { step: 2, prompt: "Claims options", action: "Press 1 for new claim, 2 for existing" },
        { step: 3, prompt: "Policy type", action: "Select appropriate coverage type" },
      ],
    },
    openingScript: "Hello, I'm calling from [Company Name], policy number [Policy Number]. I need to [file a new claim / check on claim [Claim Number]].",
    objectivePrompts: {
      new_claim: "I need to file a claim for [damage/loss/liability]. The incident occurred on [Date] at [Location].",
      claim_status: "I'm calling about claim [Claim Number] filed on [Date]. What's the current status?",
    },
    closingScript: "Thank you. Please send the claim acknowledgment to [Email] and provide the adjuster's contact information.",
    requiredAccountInfo: {
      required: ["Policy Number", "Company Name"],
      helpful: ["Date of Loss", "Location", "Police Report Number"],
    },
    typicalQuestions: {
      verification: ["Policy number", "Policyholder name", "Company address"],
      claim_details: ["Date of incident", "Description", "Estimated damages", "Witnesses"],
    },
    escalationTriggers: {
      triggers: [
        "Claim denied",
        "Coverage dispute",
        "Claim value exceeds $10,000",
        "Need legal consultation",
      ],
    },
    maxCallDuration: 1800,
  },

  // ============================================
  // QUOTE GATHERING PLAYBOOKS
  // ============================================

  // Generic vendor quote request
  {
    playbookKey: "vendor_quote_request",
    name: "Vendor/Supplier - Request Price Quote",
    description: "Call a vendor or supplier to request pricing quotes for products, raw materials, or services. Gathers unit prices, lead times, minimum order quantities, volume discounts, and payment terms.",
    targetCompany: "Generic Vendor",
    phoneNumber: "",
    department: "Sales / Quotes",
    operatingHours: "Business hours (varies)",
    ivrInstructions: {
      steps: [
        { step: 1, prompt: "Language selection", action: "Press 1 for English" },
        { step: 2, prompt: "Main menu", action: "Press 2 for Sales or say 'New order'" },
        { step: 3, prompt: "Sales options", action: "Say 'Price quote' or 'Speak to a representative'" },
      ],
    },
    openingScript: "Hello, my name is [Agent Name] and I'm calling from [Company Name]. I'm looking to get a price quote for [items/services]. We're an established business and are evaluating suppliers. May I speak with someone in your sales department who can provide pricing?",
    objectivePrompts: {
      new_quote: "I need pricing on the following items: [Item List]. For each item, I need the unit price, minimum order quantity, lead time, and any volume discounts available.",
      bulk_pricing: "We're looking at ordering [Quantity] units of [Item]. What's your best price at that volume? Do you offer tiered pricing?",
      service_quote: "I need a quote for [Service Description]. What are your rates, and what's included in the pricing?",
      compare_pricing: "We're currently paying [Current Price] for [Item] from another supplier. Can you match or beat that price? What would your terms be?",
    },
    closingScript: "Thank you for the pricing information. Can you also send a formal written quote to [Email]? What's the validity period for these prices? And who should I contact for follow-up questions?",
    requiredAccountInfo: {
      required: ["Company Name", "Items/Services Needed"],
      helpful: ["Quantity Required", "Delivery Location", "Current Supplier/Price", "Account Number (if existing customer)"],
    },
    typicalQuestions: {
      verification: ["Company name", "Contact information", "Delivery address"],
      quote_details: [
        "What specific items do you need?",
        "What quantity are you looking for?",
        "When do you need delivery?",
        "Is this a one-time order or recurring?",
        "What's your preferred payment method?",
      ],
    },
    escalationTriggers: {
      triggers: [
        "Vendor requires an in-person meeting for pricing",
        "Items are custom/specialized requiring engineering review",
        "Vendor won't provide pricing without a signed NDA",
        "Call exceeds 20 minutes without getting pricing",
        "Vendor requires a formal RFQ submission via their portal",
      ],
    },
    maxCallDuration: 1500,
  },

  // Raw materials supplier quote
  {
    playbookKey: "raw_materials_quote",
    name: "Raw Materials Supplier - Bulk Pricing Quote",
    description: "Call raw materials suppliers to get pricing on bulk ingredients, packaging materials, or manufacturing inputs. Focuses on bulk pricing tiers, MOQs, certifications, and delivery terms.",
    targetCompany: "Raw Materials Supplier",
    phoneNumber: "",
    department: "Sales / Account Management",
    operatingHours: "Mon-Fri 8am-5pm local time",
    ivrInstructions: {
      steps: [
        { step: 1, prompt: "Main menu", action: "Press 1 for Sales or new orders" },
        { step: 2, prompt: "Sales options", action: "Say 'New customer quote' or press 2" },
        { step: 3, prompt: "Representative", action: "Wait to be connected to sales" },
      ],
    },
    openingScript: "Hello, I'm calling from [Company Name]. We're a [industry type] company looking to source [material type]. I'd like to get pricing on bulk quantities. Could I speak with someone about wholesale pricing?",
    objectivePrompts: {
      bulk_quote: "I need pricing for [Quantity] [units] of [Material]. Can you provide your price per [unit] at different volume tiers? What's your minimum order quantity?",
      material_specs: "For [Material], what specifications or grades do you offer? What certifications do you hold (organic, non-GMO, food-grade, etc.)?",
      recurring_supply: "We need approximately [Quantity] per [week/month]. What pricing and terms can you offer for a recurring supply agreement?",
    },
    closingScript: "Thank you for the pricing details. Can you send a formal quote with spec sheets to [Email]? What's the lead time from order placement? And do you offer samples we could evaluate?",
    requiredAccountInfo: {
      required: ["Company Name", "Material Name/Type", "Approximate Quantity"],
      helpful: ["Required Certifications", "Delivery Location", "Urgency/Timeline", "Current Supplier"],
    },
    typicalQuestions: {
      verification: ["Company name", "Industry", "End use for materials"],
      quote_details: [
        "Material specifications needed",
        "Order quantity and frequency",
        "Required certifications",
        "Delivery requirements",
        "Payment terms preference",
      ],
    },
    escalationTriggers: {
      triggers: [
        "Material requires custom formulation",
        "Vendor needs site visit or audit",
        "Pricing requires executive approval",
        "Material has regulatory/compliance considerations",
      ],
    },
    maxCallDuration: 1200,
  },

  // Equipment/service quote
  {
    playbookKey: "equipment_service_quote",
    name: "Equipment/Service Provider - Quote Request",
    description: "Call equipment dealers, service providers, or contractors to get quotes for machinery, maintenance, repairs, IT services, or professional services.",
    targetCompany: "Service/Equipment Provider",
    phoneNumber: "",
    department: "Sales / Estimating",
    operatingHours: "Mon-Fri 8am-6pm local time",
    ivrInstructions: {
      steps: [
        { step: 1, prompt: "Main menu", action: "Press 1 for Sales or Estimates" },
        { step: 2, prompt: "Inquiry type", action: "Select equipment or service" },
        { step: 3, prompt: "Representative", action: "Wait for sales representative" },
      ],
    },
    openingScript: "Hello, I'm calling from [Company Name]. We're looking to get a quote for [equipment/service]. I'd like to discuss our requirements and get pricing information.",
    objectivePrompts: {
      equipment_purchase: "I need pricing on [Equipment]. What models do you carry, what are the price ranges, and what's included (warranty, installation, training)?",
      service_contract: "I need a quote for [Service] on a [one-time/recurring] basis. What are your rates and what's included in the service?",
      repair_estimate: "I need an estimate for repairing/servicing [Equipment/System]. The issue is [description]. What would the typical cost and timeline be?",
      lease_options: "I'm interested in [Equipment]. Do you offer leasing options? What are the monthly payments and terms?",
    },
    closingScript: "Thank you for the information. Can you email a formal proposal/quote to [Email]? What's the typical turnaround time for a formal quote? And what's the quote validity period?",
    requiredAccountInfo: {
      required: ["Company Name", "Equipment/Service Description"],
      helpful: ["Current Equipment/Setup", "Budget Range", "Timeline", "Location"],
    },
    typicalQuestions: {
      verification: ["Company name", "Location", "Current setup"],
      quote_details: [
        "Specific equipment model or service needed",
        "Quantity or scope of work",
        "Installation/implementation requirements",
        "Budget range",
        "Decision timeline",
      ],
    },
    escalationTriggers: {
      triggers: [
        "Requires on-site assessment for accurate quote",
        "Custom engineering or design needed",
        "Quote exceeds $50,000 requiring management approval",
        "Vendor requires formal RFP",
      ],
    },
    maxCallDuration: 1500,
  },

  // Packaging supplier quote
  {
    playbookKey: "packaging_quote",
    name: "Packaging Supplier - Quote Request",
    description: "Call packaging suppliers to get quotes on boxes, labels, bottles, pouches, custom packaging, and other packaging materials. Covers pricing tiers, setup fees, and lead times.",
    targetCompany: "Packaging Supplier",
    phoneNumber: "",
    department: "Sales",
    operatingHours: "Mon-Fri 8am-5pm local time",
    ivrInstructions: {
      steps: [
        { step: 1, prompt: "Main menu", action: "Press 1 for Sales" },
        { step: 2, prompt: "Sales type", action: "Say 'New quote' or press 1" },
        { step: 3, prompt: "Representative", action: "Wait for sales representative" },
      ],
    },
    openingScript: "Hi, I'm calling from [Company Name]. We're looking for packaging for our [product type] and need pricing on [packaging type]. Can you help me with a quote?",
    objectivePrompts: {
      standard_packaging: "I need pricing on [Quantity] units of [Packaging Type] in size [Dimensions]. What are your prices at different volume tiers?",
      custom_packaging: "We need custom [packaging type] with our branding. What are the setup/tooling fees, per-unit costs at [Quantity], and lead time for custom orders?",
      label_printing: "I need pricing on [Quantity] labels, size [Dimensions], [number] colors. What's the cost per unit and what are your minimum runs?",
    },
    closingScript: "Great, thank you. Can you email a detailed quote with volume pricing tiers to [Email]? Do you have samples available? And what's the typical production lead time?",
    requiredAccountInfo: {
      required: ["Company Name", "Packaging Type", "Estimated Quantity"],
      helpful: ["Product Dimensions", "Artwork Ready (yes/no)", "Material Preference", "Delivery Timeline"],
    },
    typicalQuestions: {
      verification: ["Company name", "Product type", "Where are you located?"],
      quote_details: [
        "Packaging type and material",
        "Dimensions and specifications",
        "Quantity needed",
        "Custom printing requirements",
        "Delivery timeline",
      ],
    },
    escalationTriggers: {
      triggers: [
        "Custom packaging requires design consultation",
        "Material not in stock, requires special order",
        "Structural design review needed",
        "Food-grade or regulatory certification questions",
      ],
    },
    maxCallDuration: 1200,
  },
];

// ============================================
// SEED PLAYBOOKS INTO DATABASE
// ============================================

export async function seedPlaybooks(): Promise<{ seeded: number; skipped: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let seeded = 0;
  let skipped = 0;

  for (const template of PLAYBOOK_TEMPLATES) {
    // Check if playbook already exists
    const existing = await db
      .select()
      .from(aiPhoneCallPlaybooks)
      .where(eq(aiPhoneCallPlaybooks.playbookKey, template.playbookKey));

    if (existing.length > 0) {
      skipped++;
      continue;
    }

    await db.insert(aiPhoneCallPlaybooks).values({
      playbookKey: template.playbookKey,
      name: template.name,
      description: template.description,
      targetCompany: template.targetCompany,
      phoneNumber: template.phoneNumber || null,
      department: template.department,
      operatingHours: template.operatingHours,
      ivrInstructions: JSON.stringify(template.ivrInstructions),
      openingScript: template.openingScript,
      objectivePrompts: JSON.stringify(template.objectivePrompts),
      closingScript: template.closingScript,
      requiredAccountInfo: JSON.stringify(template.requiredAccountInfo),
      typicalQuestions: JSON.stringify(template.typicalQuestions),
      escalationTriggers: JSON.stringify(template.escalationTriggers),
      maxCallDuration: template.maxCallDuration,
      isActive: true,
    });

    seeded++;
  }

  return { seeded, skipped };
}
