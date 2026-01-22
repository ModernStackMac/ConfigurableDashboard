# Plan: Create New hmDataSourceQueryBuilder LWC - Page 1 Only

## Overview
Create a clean, minimal Lightning Web Component focused solely on Page 1 (Basic Information) of the Data Source Builder. This will be a fresh start without the complexity of the existing wizard.

## Component Details
- **Name**: `hmDataSourceQueryBuilder`
- **Type**: Quick Action (Screen Action)
- **Purpose**: Create/Edit Data Source basic information
- **Scope**: Page 1 only - no query builder, no preview

## Decisions

### 1. Active Field: Toggle vs Checkbox
**Decision: Use Toggle**
- **Rationale**: 
  - Toggles are better for binary on/off states (Active/Inactive)
  - More modern UX pattern
  - Better visual feedback
  - Aligns with Salesforce Lightning Design System best practices
  - The current implementation already uses toggle and it works well

### 2. Record Picker Configuration
- Use `lightning-record-picker` for Dashboard Component lookup
- Ensure proper object API name: `HM_Dashboard_Component__c`
- Add help text for clarity
- Handle required field validation

## File Structure
```
force-app/main/default/lwc/hmDataSourceQueryBuilder/
├── hmDataSourceQueryBuilder.js
├── hmDataSourceQueryBuilder.html
├── hmDataSourceQueryBuilder.css
└── hmDataSourceQueryBuilder.js-meta.xml
```

## Implementation Steps

### Step 1: Create Component Structure
- Create all 4 required files
- Configure as Quick Action (ScreenAction)
- Set up basic component class

### Step 2: Implement Page 1 Form
- Data Source Name (text input, required)
- Active (toggle, default: true)
- Dashboard Component (record picker, required)
- Proper SLDS layout (2x2 grid)

### Step 3: Form Validation
- Validate required fields
- Show error messages
- Disable Save button until valid

### Step 4: Load Existing Data
- Wire to Apex `loadDataSource` method
- Populate form when `recordId` is provided
- Handle loading states

### Step 5: Save Functionality
- Create/Update Data Source record
- Show success/error messages
- Close modal on success

### Step 6: Apex Service
- Keep only `loadDataSource` method active
- Add `saveDataSourceBasicInfo` method (name, active, dashboardComponentId only)
- Remove all Page 2/3 dependencies

## Component Properties

### Public Properties
- `@api recordId` - For editing existing records

### Private Properties
- `formData` - Object with name, active, dashboardComponentId
- `isLoading` - Loading state
- `error` - Error message
- `isSaving` - Saving state

## Apex Methods Needed

### Keep Active
- `loadDataSource(Id recordId)` - Load existing record

### New Method
- `saveDataSourceBasicInfo(Id recordId, String name, Boolean active, Id dashboardComponentId)` - Save Page 1 data only

## UI Layout
```
┌─────────────────────────────────────┐
│  Edit Data Source              [X] │
├─────────────────────────────────────┤
│                                     │
│  * Data Source Name: [________]    │
│                                     │
│  Active: [Toggle: ON]              │
│                                     │
│  * Dashboard Component: [Picker]   │
│    ℹ️ Select the dashboard...       │
│                                     │
│                    [Cancel] [Save]  │
└─────────────────────────────────────┘
```

## Validation Rules
1. Data Source Name: Required, non-empty
2. Dashboard Component: Required, must have value
3. Active: Optional (defaults to true)

## Error Handling
- Show toast messages for errors
- Display inline validation errors
- Handle Apex exceptions gracefully

## Testing Considerations
- Test create new record
- Test edit existing record
- Test validation errors
- Test record picker functionality
- Test toggle state changes

## Next Steps (Future)
- Page 2: Query Builder (separate component or add later)
- Page 3: Results Preview (separate component or add later)
