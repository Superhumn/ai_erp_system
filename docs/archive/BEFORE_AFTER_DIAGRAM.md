# Integration Buttons - Before and After

## BEFORE (Broken) ❌

```
User clicks "Configure" button
         ↓
onClick handler executes
         ↓
document.querySelector('[data-value="email"]') 
         ↓
Returns NULL (attribute doesn't exist)
         ↓
Nothing happens - Tab doesn't switch ❌
```

**Code:**
```typescript
<Button onClick={() => {
  const tab = document.querySelector('[data-value="email"]');
  if (tab) (tab as HTMLElement).click(); // Never executes
}}>
```

**Problem:** Radix UI TabsTrigger components don't expose `data-value` attribute

---

## AFTER (Fixed) ✅

```
User clicks "Configure" button
         ↓
onClick handler executes
         ↓
setActiveTab('email') called
         ↓
React state updates
         ↓
Tabs component re-renders
         ↓
Email tab becomes active ✅
```

**Code:**
```typescript
const [activeTab, setActiveTab] = useState("connections");

<Tabs value={activeTab} onValueChange={setActiveTab}>

<Button onClick={() => {
  console.log('SendGrid Configure clicked, switching to email tab');
  setActiveTab('email'); // Updates React state
}}>
```

**Solution:** Proper React state management with controlled component

---

## Key Differences

| Aspect | Before (Broken) | After (Fixed) |
|--------|----------------|---------------|
| **Approach** | DOM manipulation | React state management |
| **Tabs control** | Uncontrolled (`defaultValue`) | Controlled (`value` + `onValueChange`) |
| **State** | No state tracking | `activeTab` state variable |
| **Debugging** | No logging | Console.log on every click |
| **Works?** | ❌ No | ✅ Yes |

---

## Integration Button Map

```
Settings → Integrations Page
│
├── Connections Tab (Overview)
│   ├── SendGrid Card
│   │   └── [Configure] → Switches to "email" tab
│   │
│   ├── Shopify Card
│   │   └── [Configure] → Switches to "shopify" tab
│   │
│   ├── Google Sheets Card
│   │   └── [Connect/Manage] → Navigates to /import
│   │
│   ├── Gmail Card
│   │   └── [Configure] → Switches to "gmail" tab
│   │
│   ├── Google Workspace Card
│   │   └── [Configure] → Switches to "workspace" tab
│   │
│   └── QuickBooks Card
│       └── [Coming Soon] → Disabled
│
├── Shopify Tab
│   └── [Add Store] → Opens dialog
│
├── Email Tab
│   └── [Send Test] → Tests SendGrid
│
├── Gmail Tab
│   └── [Connect Gmail] → Navigates to /import
│
├── Workspace Tab
│   └── [Connect Google Workspace] → Navigates to /import
│
└── History Tab
    └── [Clear History] → Clears sync logs
```

All buttons marked with arrows (→) are now working correctly! ✅
