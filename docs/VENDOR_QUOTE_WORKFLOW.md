# Autonomous Vendor Quote Procurement Workflow

## Overview

The Autonomous Vendor Quote Procurement Workflow is an AI-powered system that automates the entire vendor quote procurement process, from vendor selection to quote analysis and approval. The workflow integrates seamlessly with the existing ERP system and provides intelligent automation while maintaining human oversight for critical decisions.

## Features

### 1. Vendor Quote Procurement Workflow

Automates the process of finding vendors and requesting quotes:

- **AI-Powered Vendor Search**: Uses AI to identify suitable vendor types based on material requirements
- **Intelligent Vendor Selection**: Automatically ranks and selects the best vendors based on:
  - Historical performance
  - Lead time capabilities
  - Geographic location
  - Material specialization
  - Minimum order requirements
- **AI-Generated RFQ Emails**: Creates professional, context-aware RFQ emails for each vendor
- **Multi-Vendor Outreach**: Simultaneously contacts multiple vendors (configurable, default: 5)
- **Email Monitoring Integration**: Sets up quote monitoring through the email scanning system

### 2. Vendor Quote Analysis Workflow

Analyzes received quotes and provides intelligent recommendations:

- **Automated Quote Collection**: Fetches all quotes received for an RFQ
- **AI-Powered Analysis**: Comprehensive analysis considering:
  - Unit price and total cost
  - Lead time and delivery dates
  - Additional charges (shipping, handling, taxes)
  - Vendor reliability and history
- **Multi-Factor Ranking**:
  - Price comparison rank (lower is better)
  - Lead time comparison rank (faster is better)
  - Overall combined score (0-100)
- **Smart Recommendations**: AI provides detailed reasoning for quote selection
- **Threshold-Based Auto-Approval**: 
  - Automatically approves quotes below configured threshold (default: $5,000)
  - Routes high-value quotes to human reviewers
- **Automated Notifications**: Sends award/rejection emails to vendors

### 3. Phone/Call Capabilities

Enhanced vendor communication tracking:

- **Preferred Contact Method**: Track vendor preference (email/phone/both)
- **Phone Numbers**: Primary phone, extension, mobile, fax
- **Voice Interaction Support**: Flag vendors capable of AI voice calls
- **Call Availability**: Store vendor availability schedules
- **Voice Preferences**: Record special requirements for voice communication

## Workflow Types

### vendor_quote_procurement

**Input Parameters:**
```javascript
{
  materialName: string,          // Required: Name of material
  materialDescription: string,   // Optional: Detailed description
  quantity: string,              // Required: Quantity needed
  unit: string,                  // Required: Unit of measurement
  specifications: string,        // Optional: Technical specifications
  requiredDeliveryDate: Date,    // Optional: When material is needed
  deliveryLocation: string,      // Optional: Delivery address
  priority: "low"|"normal"|"high"|"urgent",  // Default: "normal"
  maxVendors: number,            // Default: 5
  autoApproveThreshold: number   // Default: 5000
}
```

**Workflow Steps:**
1. Search for suitable vendors (AI analysis)
2. Select best vendors based on criteria
3. Create RFQ record
4. Generate and send AI-powered emails
5. Setup quote monitoring

**Output:**
```javascript
{
  rfqId: number,
  rfqNumber: string,
  vendorsContacted: number,
  emailsSent: number,
  monitoring: {
    message: string,
    quoteDueDate: Date
  }
}
```

### vendor_quote_analysis

**Input Parameters:**
```javascript
{
  rfqId: number,                 // Required: RFQ to analyze
  autoApproveThreshold: number   // Default: 5000
}
```

**Workflow Steps:**
1. Fetch RFQ and all received quotes
2. Perform AI analysis and ranking
3. Determine best quote
4. Check approval requirements
5. Auto-approve or request human review
6. Send notifications

**Output:**
```javascript
{
  rfqId: number,
  bestQuoteId: number,
  analysis: {
    rankings: Array,
    bestQuoteId: number,
    recommendation: string,
    reasoning: string,
    riskAssessment: string,
    confidence: number
  },
  autoApproved: boolean,
  approvalId: number|null,
  totalValue: number
}
```

## Database Configuration

### Workflow Setup

Run the SQL script to create default workflow configurations:

```bash
mysql -u [user] -p [database] < docs/vendor_quote_workflow_setup.sql
```

This creates:
- Vendor Quote Procurement workflow configuration
- Vendor Quote Analysis workflow configuration
- Approval thresholds for vendor quotes
- Exception handling rules
- Notification preferences

### Approval Thresholds

Default approval levels:
- **Auto-Approve**: Up to $5,000
- **Level 1** (Ops/Procurement): $5,000 - $15,000
- **Level 2** (Admin/Procurement Manager): $15,000 - $50,000
- **Level 3** (Exec/CFO): $50,000 - $100,000
- **Executive** (Exec/CEO): Above $100,000

## Usage Examples

### Manual Workflow Trigger

```typescript
import { getWorkflowEngine } from "./server/autonomousWorkflowEngine";

const engine = await getWorkflowEngine();

// Start vendor quote procurement
const result = await engine.startWorkflow(
  workflowId,
  "manual",
  {
    materialName: "Industrial Steel Beams",
    quantity: "50",
    unit: "tons",
    specifications: "ASTM A992 Grade 50",
    priority: "high",
    maxVendors: 5
  }
);

console.log("RFQ Created:", result.outputData.rfqNumber);
```

### Event-Triggered Analysis

The quote analysis workflow can be triggered automatically when:
- All vendors have responded
- Quote deadline has passed
- Minimum number of quotes received

```typescript
// Triggered by event system
await engine.startWorkflow(
  analysisWorkflowId,
  "event",
  {
    rfqId: 123,
    autoApproveThreshold: 5000
  }
);
```

## Integration Points

### Email System Integration

The workflow integrates with the existing email system:

1. **Outbound Emails**: RFQ emails are queued in `vendorRfqEmails` table
2. **Email Scanner**: Monitors inbox for quote responses
3. **AI Parsing**: Extracts quote data from vendor emails
4. **Quote Creation**: Automatically creates quote records from parsed data

### Approval System Integration

High-value quotes route through the approval system:

1. **Approval Queue**: Creates records in `workflowApprovalQueue`
2. **Role-Based Routing**: Assigns to appropriate roles based on threshold
3. **Escalation**: Auto-escalates if not reviewed within timeframe
4. **Notifications**: Sends email and in-app notifications to approvers

### Vendor Management Integration

Leverages existing vendor data:

- Historical purchase orders
- Vendor performance metrics
- Default lead times and minimums
- Contact information and preferences
- Phone/call capabilities

## Configuration

### Environment Variables

```bash
# Procurement email address for RFQ communications
PROCUREMENT_EMAIL=procurement@company.com
```

### Workflow Execution Config

Customize workflow behavior via `executionConfig` JSON:

```json
{
  "maxVendors": 5,
  "quoteDueDays": 7,
  "validityPeriodDays": 30,
  "minQuotesRequired": 2,
  "searchCriteria": [
    "material_type",
    "geographic_location",
    "industry_specialization"
  ],
  "rankingFactors": {
    "price": 50,
    "leadTime": 30,
    "vendorHistory": 20
  }
}
```

## Testing

Comprehensive test suite with 29 tests covering:

- Workflow type validation
- Input parameter validation
- Vendor search and selection
- RFQ creation and numbering
- Email generation
- Quote analysis and ranking
- Approval threshold logic
- Notification handling
- End-to-end workflow integration

Run tests:
```bash
npm test -- vendorQuoteWorkflow.test.ts
```

## Demo

Run the interactive demo to see the workflow in action:

```bash
npx tsx server/vendorQuoteWorkflowDemo.ts
```

The demo showcases:
- Vendor procurement workflow steps
- Quote analysis with multiple scenarios
- Auto-approval vs manual approval
- Phone/call capability tracking

## Security

### Security Scan Results

✅ **CodeQL Security Scan**: 0 vulnerabilities found

### Security Features

- Input validation on all workflow parameters
- Environment variables for sensitive configuration
- Role-based access control for approvals
- Audit trail for all workflow actions
- Approval requirements for high-value transactions

## Monitoring & Metrics

The workflow tracks comprehensive metrics:

- Total runs and success rate
- Items processed (vendors contacted, quotes analyzed)
- Total value processed
- AI decision count and token usage
- Average duration per workflow
- Approval rates (auto vs manual)

Access metrics via:
- Workflow dashboard
- `workflowMetrics` table
- `workflowRuns` and `workflowSteps` tables

## Exception Handling

Built-in exception handling for common scenarios:

1. **No Quotes Received**: Routes to human for vendor follow-up
2. **Single Quote**: AI decides if acceptable or need more quotes
3. **All Quotes Exceed Budget**: Escalates to management
4. **Expired Quotes**: Routes to human for renewal request
5. **Delivery Date Conflicts**: Flags for review but continues

## Future Enhancements

Potential improvements:

- [ ] Voice/phone integration for vendor calls
- [ ] Automated vendor discovery via web search
- [ ] Integration with external pricing databases
- [ ] Predictive analytics for quote pricing
- [ ] Automated PO creation from approved quotes
- [ ] Vendor negotiation agent
- [ ] Multi-currency support
- [ ] Real-time quote comparison dashboard

## Support

For issues or questions:
- Review test suite for usage examples
- Check demo script for workflow patterns
- Examine `workflowProcessors.ts` for implementation details
- Refer to `autonomousWorkflowEngine.ts` for core workflow logic
