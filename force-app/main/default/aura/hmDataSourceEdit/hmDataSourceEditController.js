/* eslint-disable no-unused-expressions */
({
    handleClose: function(component, event, helper) {
        // Navigate back to the record page
        var recordId = component.get("v.recordId");
        helper.navigateToRecord(component, recordId);
    },
    
    handleSaveSuccess: function(component, event, helper) {
        // Navigate to the saved record
        var recordId = event.getParam("recordId") || component.get("v.recordId");
        helper.navigateToRecord(component, recordId);
    }
})
