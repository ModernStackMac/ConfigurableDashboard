import { api, track, wire, LightningElement } from "lwc";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import { CloseActionScreenEvent } from "lightning/actions";
import { getRecord, getFieldValue } from "lightning/uiRecordApi";
import { loadScript, loadStyle } from "lightning/platformResourceLoader";
import CODEMIRROR from "@salesforce/resourceUrl/codemirror";
import COMPONENT_TYPE_FIELD from "@salesforce/schema/HM_Dashboard_Component__c.HM_Type__c";
import loadDataSource from "@salesforce/apex/HM_DataSourceBuilderService.loadDataSource";
import saveDataSourceBasicInfo from "@salesforce/apex/HM_DataSourceBuilderService.saveDataSourceBasicInfo";
import getAccessibleObjects from "@salesforce/apex/HM_DataSourceBuilderService.getAccessibleObjects";
import getObjectFields from "@salesforce/apex/HM_DataSourceBuilderService.getObjectFields";

/**
 * @description Data Source Query Builder - Multi-step wizard for creating/editing Data Sources
 * @author High Meadows
 * @date 2024
 */
export default class HM_DataSourceQueryBuilder extends LightningElement {
  // ==================== PUBLIC PROPERTIES ====================
  @api recordId; // Record ID from Quick Action context (for editing existing records)

  // ==================== WIZARD STATE ====================
  currentStep = 1;

  // ==================== PAGE 1 STATE ====================
  @track formData = {
    name: "",
    active: true,
    dashboardComponentId: null,
    order: 1,
    rowIconName: ""
  };

  componentType = null;

  // ==================== PAGE 2 STATE ====================
  @track page2Data = {
    selectedObjectApiName: null,
    selectedObjectLabel: null
  };

  // Object search state
  allObjects = [];
  @track filteredObjects = [];
  objectSearchTerm = "";
  isObjectListOpen = false;
  isLoadingObjects = false;
  highlightedIndex = -1;

  // Field selection state
  allFields = [];
  @track selectedFieldApiNames = [];
  isLoadingFields = false;
  fieldCache = {};
  fieldSearchTerm = "";

  // CodeMirror state
  codeMirrorInitialized = false;
  codeMirrorEditor = null;

  // ==================== COMMON STATE ====================
  isLoading = false;
  isSaving = false;
  error = null;

  // ==================== WIRE ADAPTERS ====================

  /**
   * @description Wire adapter to fetch Dashboard Component type when component is selected
   */
  @wire(getRecord, {
    recordId: "$formData.dashboardComponentId",
    fields: [COMPONENT_TYPE_FIELD]
  })
  wiredDashboardComponent({ error, data }) {
    if (data) {
      this.componentType = getFieldValue(data, COMPONENT_TYPE_FIELD);
    } else if (error) {
      this.componentType = null;
    }
  }

  // ==================== LIFECYCLE HOOKS ====================

  connectedCallback() {
    // Load existing data if recordId is provided (from Quick Action context)
    if (this.recordId) {
      this.loadExistingData();
    }
  }

  // ==================== FORM HANDLERS ====================

  /**
   * @description Handle Data Source Name input change
   * @param {Event} event - Input change event
   */
  handleNameChange(event) {
    this.formData.name = event.target.value || "";
    this.clearError();
  }

  /**
   * @description Handle Active toggle change
   * @param {Event} event - Toggle change event
   */
  handleActiveChange(event) {
    this.formData.active = event.target.checked;
  }

  /**
   * @description Handle Dashboard Component record picker change
   * @param {Event} event - Record picker change event
   */
  handleDashboardComponentChange(event) {
    this.formData.dashboardComponentId = event.detail.recordId || null;
    // Reset row icon when component changes (componentType updated by wire adapter)
    this.formData.rowIconName = "";
    this.clearError();
  }

  /**
   * @description Handle Order input change
   * @param {Event} event - Input change event
   */
  handleOrderChange(event) {
    this.formData.order = event.target.value ? parseInt(event.target.value, 10) : 1;
  }

  /**
   * @description Handle Row Icon Name input change
   * @param {Event} event - Input change event
   */
  handleRowIconNameChange(event) {
    this.formData.rowIconName = event.target.value || "";
  }

  // ==================== ACTION HANDLERS ====================

  /**
   * @description Handle Cancel button click
   */
  handleCancel() {
    this.closePanel();
  }

  /**
   * @description Handle Next button click - navigates to Page 2 (no save until final step)
   */
  handleNext() {
    if (!this.isPage1Valid) {
      return;
    }

    this.clearError();
    
    // Navigate to Page 2
    this.currentStep = 2;

    // Load objects for Page 2
    this.loadObjects();

    // Initialize CodeMirror (deferred to allow DOM to render)
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    setTimeout(() => {
      this.initializeCodeMirror();
    }, 100);
  }

  /**
   * @description Handle Back button click - returns to Page 1
   */
  handleBack() {
    this.currentStep = 1;
    this.clearError();
  }

  /**
   * @description Handle Save button click on final page - saves all wizard data
   */
  async handleSave() {
    if (!this.isPage2Valid) {
      return;
    }

    this.isSaving = true;
    this.clearError();

    try {
      // Save all wizard data (Page 1 + Page 2)
      await saveDataSourceBasicInfo({
        recordId: this.recordId,
        name: this.formData.name.trim(),
        active: this.formData.active,
        dashboardComponentId: this.formData.dashboardComponentId,
        orderValue: this.formData.order,
        rowIconName: this.formData.rowIconName?.trim() || null
      });

      // TODO: Save Page 2 data (selected object) when field is added to Data Source

      this.showToast("Success", "Data Source saved successfully", "success");
      this.closePanel();
    } catch (error) {
      const errorMessage = error.body?.message || error.message || "Error saving data source";
      this.showError("Error", errorMessage);
    } finally {
      this.isSaving = false;
    }
  }

  /**
   * @description Load all accessible objects for Page 2
   */
  async loadObjects() {
    if (this.allObjects.length > 0) {
      // Already loaded, just filter
      this.filterObjects();
      return;
    }

    this.isLoadingObjects = true;

    try {
      const objects = await getAccessibleObjects();
      this.allObjects = objects;
      this.filterObjects();
    } catch (error) {
      const errorMessage = error.body?.message || error.message || "Error loading objects";
      this.showError("Error", errorMessage);
    } finally {
      this.isLoadingObjects = false;
    }
  }

  /**
   * @description Load fields for selected object
   * @param {string} objectApiName - API name of object to load fields for
   */
  async loadFieldsForObject(objectApiName) {
    if (!objectApiName) {
      return;
    }

    // Check cache first
    if (this.fieldCache[objectApiName]) {
      this.allFields = this.fieldCache[objectApiName];
      this.selectedFieldApiNames = [];
      this.fieldSearchTerm = "";
      this.updateSoqlPreview();
      return;
    }

    this.isLoadingFields = true;

    try {
      const fields = await getObjectFields({ objectApiName });
      this.fieldCache[objectApiName] = fields;
      this.allFields = fields;
      this.selectedFieldApiNames = [];
      this.fieldSearchTerm = "";
      this.updateSoqlPreview();
    } catch (error) {
      const errorMessage = error.body?.message || error.message || "Error loading fields";
      this.showError("Error", errorMessage);
    } finally {
      this.isLoadingFields = false;
    }
  }

  // ==================== OBJECT SEARCH HANDLERS ====================

  /**
   * @description Handle object search input
   * @param {Event} event - Input event
   */
  handleObjectSearchInput(event) {
    this.objectSearchTerm = event.target.value;
    this.filterObjects();
    this.isObjectListOpen = true;
    this.highlightedIndex = -1;
  }

  /**
   * @description Handle object selection from dropdown
   * @param {Event} event - Click event
   */
  handleObjectSelect(event) {
    const apiName = event.currentTarget.dataset.value;
    const obj = this.allObjects.find((o) => o.apiName === apiName);
    if (obj) {
      this.page2Data.selectedObjectApiName = obj.apiName;
      this.page2Data.selectedObjectLabel = obj.label;
      this.objectSearchTerm = obj.label;
      this.isObjectListOpen = false;
      this.highlightedIndex = -1;

      // Load fields for selected object
      this.loadFieldsForObject(obj.apiName);
    }
  }

  /**
   * @description Handle field search input change
   * @param {Event} event - Input change event
   */
  handleFieldSearchChange(event) {
    this.fieldSearchTerm = event.target.value || "";
  }

  /**
   * @description Handle field checkbox toggle
   * @param {Event} event - Checkbox change event
   */
  handleFieldCheckboxChange(event) {
    const apiName = event.target.dataset.apiName;
    const isChecked = event.target.checked;

    if (isChecked) {
      this.selectedFieldApiNames = [...this.selectedFieldApiNames, apiName];
    } else {
      this.selectedFieldApiNames = this.selectedFieldApiNames.filter((f) => f !== apiName);
    }

    this.updateSoqlPreview();
  }

  /**
   * @description Clear object selection
   */
  handleObjectClear() {
    this.page2Data.selectedObjectApiName = null;
    this.page2Data.selectedObjectLabel = null;
    this.objectSearchTerm = "";
    this.isObjectListOpen = false;
    this.highlightedIndex = -1;
    this.filterObjects();
    // Reset field selection
    this.allFields = [];
    this.selectedFieldApiNames = [];
    this.fieldSearchTerm = "";
    this.updateSoqlPreview();
  }

  /**
   * @description Handle focus on object search input
   */
  handleObjectFocus() {
    this.isObjectListOpen = true;
    this.filterObjects();
  }

  /**
   * @description Handle blur on object search input
   * @param {Event} event - Blur event
   */
  handleObjectBlur() {
    // Delay closing to allow click events on dropdown items
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    setTimeout(() => {
      this.isObjectListOpen = false;
      this.highlightedIndex = -1;
    }, 200);
  }

  /**
   * @description Handle keyboard navigation in object dropdown
   * @param {KeyboardEvent} event - Keyboard event
   */
  handleObjectKeydown(event) {
    if (!this.isObjectListOpen && event.key !== "ArrowDown") {
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        this.isObjectListOpen = true;
        if (this.highlightedIndex < this.filteredObjects.length - 1) {
          this.highlightedIndex++;
        }
        break;
      case "ArrowUp":
        event.preventDefault();
        if (this.highlightedIndex > 0) {
          this.highlightedIndex--;
        }
        break;
      case "Enter":
        event.preventDefault();
        if (this.highlightedIndex >= 0 && this.highlightedIndex < this.filteredObjects.length) {
          const obj = this.filteredObjects[this.highlightedIndex];
          this.page2Data.selectedObjectApiName = obj.apiName;
          this.page2Data.selectedObjectLabel = obj.label;
          this.objectSearchTerm = obj.label;
          this.isObjectListOpen = false;
          this.highlightedIndex = -1;
          // Load fields for selected object
          this.loadFieldsForObject(obj.apiName);
        }
        break;
      case "Escape":
        event.preventDefault();
        this.isObjectListOpen = false;
        this.highlightedIndex = -1;
        break;
      default:
        break;
    }
  }

  /**
   * @description Filter objects based on search term
   */
  filterObjects() {
    const term = this.objectSearchTerm.toLowerCase().trim();
    if (!term) {
      // Show first 50 objects when no search term
      this.filteredObjects = this.allObjects.slice(0, 50).map((obj, index) => ({
        ...obj,
        itemClass: this.getItemClass(index)
      }));
    } else {
      this.filteredObjects = this.allObjects
        .filter(
          (obj) =>
            obj.label.toLowerCase().includes(term) || obj.apiName.toLowerCase().includes(term)
        )
        .slice(0, 50)
        .map((obj, index) => ({
          ...obj,
          itemClass: this.getItemClass(index)
        }));
    }
  }

  /**
   * @description Get CSS class for dropdown item
   * @param {number} index - Item index
   * @returns {string} CSS classes
   */
  getItemClass(index) {
    const baseClass = "slds-media slds-listbox__option slds-listbox__option_entity";
    return index === this.highlightedIndex ? `${baseClass} slds-has-focus` : baseClass;
  }

  /**
   * @description Check if no results message should be shown
   * @returns {boolean} True if no results and search term exists
   */
  get showNoResults() {
    return (
      this.isObjectListOpen &&
      !this.isLoadingObjects &&
      this.filteredObjects.length === 0 &&
      this.objectSearchTerm.trim() !== ""
    );
  }

  /**
   * @description Get combobox container classes
   * @returns {string} CSS classes for combobox
   */
  get comboboxClasses() {
    const base = "slds-combobox slds-dropdown-trigger slds-dropdown-trigger_click";
    return this.isObjectListOpen ? `${base} slds-is-open` : base;
  }

  /**
   * @description Get filtered field options with selection state for checkbox list
   * @returns {Array} Field options filtered by search term with selection state
   */
  get filteredFieldOptions() {
    const term = this.fieldSearchTerm.toLowerCase().trim();
    let fields = this.allFields;

    if (term) {
      fields = fields.filter(
        (f) => f.label.toLowerCase().includes(term) || f.apiName.toLowerCase().includes(term)
      );
    }

    return fields.map((f) => ({
      ...f,
      displayLabel: `${f.label} (${f.apiName})`,
      isSelected: this.selectedFieldApiNames.includes(f.apiName)
    }));
  }

  /**
   * @description Check if there are filtered fields to display
   * @returns {boolean} True if filtered fields exist
   */
  get hasFilteredFields() {
    return this.filteredFieldOptions.length > 0;
  }

  /**
   * @description Get count of selected fields
   * @returns {number} Number of selected fields
   */
  get selectedFieldCount() {
    return this.selectedFieldApiNames.length;
  }

  // ==================== VALIDATION ====================

  /**
   * @description Validate form data
   * @returns {boolean} True if form is valid
   */
  validateForm() {
    // Validate Data Source Name
    if (!this.formData.name || this.formData.name.trim() === "") {
      this.showError("Validation Error", "Data Source Name is required");
      return false;
    }

    // Validate Dashboard Component
    if (!this.formData.dashboardComponentId) {
      this.showError("Validation Error", "Dashboard Component is required");
      return false;
    }

    return true;
  }

  // ==================== DATA LOADING ====================

  /**
   * @description Load existing data source record for editing
   */
  async loadExistingData() {
    if (!this.recordId) {
      return;
    }

    this.isLoading = true;
    this.clearError();

    try {
      const data = await loadDataSource({ recordId: this.recordId });
      
      if (!data) {
        throw new Error("No data returned from server");
      }
      
      this.formData.name = data.name || "";
      this.formData.active = data.active !== undefined ? data.active : true;
      this.formData.dashboardComponentId = data.dashboardComponentId || null;
      this.formData.order = data.order !== undefined ? data.order : 1;
      this.formData.rowIconName = data.rowIconName || "";
      // componentType is set by the wire adapter when dashboardComponentId changes
    } catch (error) {
      const errorMessage = error.body?.message || error.message || "Unknown error occurred";
      this.showError("Load Error", `Failed to load existing data source: ${errorMessage}`);
    } finally {
      this.isLoading = false;
    }
  }

  // ==================== UI HELPERS ====================

  /**
   * @description Get modal title based on current step
   * @returns {string} Modal title
   */
  get modalTitle() {
    const prefix = this.recordId ? "Edit" : "Create";
    if (this.currentStep === 1) {
      return `${prefix} Data Source - Basic Info`;
    }
    return `${prefix} Data Source - Select Object`;
  }

  /**
   * @description Get current step value as string for progress indicator
   * @returns {string} Current step value
   */
  get currentStepValue() {
    return String(this.currentStep);
  }

  /**
   * @description Check if currently on Page 1
   * @returns {boolean} True if on Page 1
   */
  get isPage1() {
    return this.currentStep === 1;
  }

  /**
   * @description Check if currently on Page 2
   * @returns {boolean} True if on Page 2
   */
  get isPage2() {
    return this.currentStep === 2;
  }

  /**
   * @description Check if Next button should be disabled
   * @returns {boolean} True if Next should be disabled
   */
  get isNextDisabled() {
    return this.isSaving || this.isLoading || !this.isPage1Valid;
  }

  /**
   * @description Check if Save button should be disabled (Page 2)
   * @returns {boolean} True if save should be disabled
   */
  get isSaveDisabled() {
    return this.isSaving || this.isLoading || !this.isPage2Valid;
  }

  /**
   * @description Check if Page 1 form is valid
   * @returns {boolean} True if Page 1 has all required fields filled and valid
   */
  get isPage1Valid() {
    return this.hasRequiredPage1Fields && this.isIconNameValidOrEmpty;
  }

  /**
   * @description Check if Page 2 is valid (object and at least one field selected)
   * @returns {boolean} True if Page 2 has required selections
   */
  get isPage2Valid() {
    return (
      this.page2Data.selectedObjectApiName !== null &&
      this.selectedFieldApiNames.length > 0
    );
  }

  /**
   * @description Check if Page 1 has all required fields
   * @returns {boolean} True if required fields are filled
   */
  get hasRequiredPage1Fields() {
    return (
      this.formData.name &&
      this.formData.name.trim() !== "" &&
      this.formData.dashboardComponentId !== null &&
      this.formData.order !== null &&
      this.formData.order !== undefined
    );
  }

  /**
   * @description Check if icon name is valid or empty (empty is allowed)
   * @returns {boolean} True if icon is valid or not provided
   */
  get isIconNameValidOrEmpty() {
    if (!this.showRowIconInput) {
      return true;
    }
    const iconName = this.formData.rowIconName?.trim();
    if (!iconName) {
      return true; // Empty is valid
    }
    return this.isValidIconName;
  }

  /**
   * @description Check if Row Icon input should be shown
   * @returns {boolean} True if component type is List
   */
  get showRowIconInput() {
    return this.componentType === "List";
  }

  /**
   * @description Valid icon prefixes for Lightning icons
   */
  static VALID_ICON_PREFIXES = ["action:", "custom:", "doctype:", "standard:", "utility:"];

  /**
   * @description Check if the row icon name has a valid prefix
   * @returns {boolean} True if icon name starts with a valid prefix
   */
  get isValidIconName() {
    const iconName = this.formData.rowIconName?.trim().toLowerCase();
    if (!iconName) {
      return false;
    }
    return HM_DataSourceQueryBuilder.VALID_ICON_PREFIXES.some((prefix) =>
      iconName.startsWith(prefix)
    );
  }

  /**
   * @description Check if icon preview should be shown
   * @returns {boolean} True if row icon name is valid
   */
  get showIconPreview() {
    return this.showRowIconInput && this.isValidIconName;
  }

  /**
   * @description Get error message for invalid icon name
   * @returns {string} Error message or empty string
   */
  get iconNameError() {
    const iconName = this.formData.rowIconName?.trim();
    if (iconName && !this.isValidIconName) {
      return "Must start with: action:, custom:, doctype:, standard:, or utility:";
    }
    return "";
  }

  // ==================== SOQL PREVIEW ====================

  /**
   * @description Generate formatted SOQL query string
   * @returns {string} Formatted SOQL query or empty string
   */
  get generatedSoql() {
    if (!this.page2Data.selectedObjectApiName || this.selectedFieldApiNames.length === 0) {
      return "";
    }

    const fields = this.selectedFieldApiNames.join(",\n       ");
    return `SELECT ${fields}\n  FROM ${this.page2Data.selectedObjectApiName}`;
  }

  /**
   * @description Check if SOQL preview should be shown
   * @returns {boolean} True if object and fields are selected
   */
  get showSoqlPreview() {
    return this.page2Data.selectedObjectApiName && this.selectedFieldApiNames.length > 0;
  }

  /**
   * @description Initialize CodeMirror editor
   */
  async initializeCodeMirror() {
    if (this.codeMirrorInitialized) {
      return;
    }

    try {
      await Promise.all([
        loadScript(this, CODEMIRROR + "/codemirror.js"),
        loadStyle(this, CODEMIRROR + "/codemirror.css")
      ]);

      // Check if CodeMirror loaded successfully (it uses ES modules, may not work directly)
      // eslint-disable-next-line no-undef
      if (typeof EditorView !== "undefined") {
        const container = this.template.querySelector(".codemirror-container");
        if (container) {
          // eslint-disable-next-line no-undef
          this.codeMirrorEditor = new EditorView({
            doc: this.generatedSoql,
            // eslint-disable-next-line no-undef
            extensions: [EditorView.editable.of(false)],
            parent: container
          });
          this.codeMirrorInitialized = true;
        }
      }
    } catch (error) {
      // CodeMirror failed to load - fallback to plain text display
      this.codeMirrorInitialized = false;
    }
  }

  /**
   * @description Update SOQL preview display
   */
  updateSoqlPreview() {
    if (this.codeMirrorEditor) {
      // Update CodeMirror content
      this.codeMirrorEditor.dispatch({
        changes: {
          from: 0,
          to: this.codeMirrorEditor.state.doc.length,
          insert: this.generatedSoql
        }
      });
    }
    // If CodeMirror not available, the template will use the generatedSoql getter directly
  }

  // ==================== UTILITY METHODS ====================

  /**
   * @description Close quick action panel
   */
  closePanel() {
    this.dispatchEvent(new CloseActionScreenEvent());
  }

  /**
   * @description Show error toast message
   * @param {string} title - Error title
   * @param {string} message - Error message
   */
  showError(title, message) {
    this.error = message;
    this.dispatchEvent(
      new ShowToastEvent({
        title: title,
        message: message,
        variant: "error",
        mode: "sticky"
      })
    );
  }

  /**
   * @description Show success toast message
   * @param {string} title - Success title
   * @param {string} message - Success message
   * @param {string} variant - Toast variant
   */
  showToast(title, message, variant = "success") {
    this.dispatchEvent(
      new ShowToastEvent({
        title: title,
        message: message,
        variant: variant
      })
    );
  }

  /**
   * @description Clear error state
   */
  clearError() {
    this.error = null;
  }
}
