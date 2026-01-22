/* eslint-disable no-unused-expressions */
({
    handleClose: function(component, event, helper) {
        // Navigate back to the object list
        helper.navigateToObjectHome(component);
    },
    
    handleSaveSuccess: function(component, event, helper) {
        // Navigate to the newly created record
        var recordId = event.getParam("recordId");
        if (recordId) {
            helper.navigateToRecord(component, recordId);
        } else {
            helper.navigateToObjectHome(component);
        }
    }
})