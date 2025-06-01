class ResponsiveTableManager {
    constructor(config) {
        this.config = {
            alertMessages: {
                addSuccess: 'New item added.',
                updateSuccess: 'Item details updated.',
                deleteConfirm: 'Are you sure you want to delete this item?',
                deleteSuccess: 'Item deleted.',
                notFound: 'Item not found.',
                formError: 'Please fill all required fields correctly.'
            },
            entityName: 'item', // Generic name, can be overridden
            ...config // Spread user config, allowing override of defaults
        };

        this.entitiesData = [];
        this.tableBody = document.getElementById(this.config.tableBodyId);
        this.cardList = document.getElementById(this.config.cardListId);
        this.modal = document.getElementById(this.config.modalId);
        this.modalTitle = document.getElementById(this.config.modalTitleId);
        this.form = document.getElementById(this.config.formId);
        this.submitButton = this.form ? this.form.querySelector('button[type="submit"]') : null;
        this.idField = this.form ? this.form.querySelector(`input[name="${this.config.entityIdField}"]`) : null;
    }

    init() {
        if (!this.tableBody && !this.cardList) {
            console.error("ResponsiveTableManager: Table body and Card list container not found. Ensure correct IDs are provided.");
            return;
        }
        if (!this.modal || !this.form || !this.idField || !this.submitButton) {
            console.warn("ResponsiveTableManager: Modal, form, idField or submit button not found. Modal functionality might be limited.");
        }
        
        if (this.config.initialData && Array.isArray(this.config.initialData)) {
            this.entitiesData = [...this.config.initialData];
        } else if (typeof this.config.extractInitialDataFn === 'function') {
            this.entitiesData = this.config.extractInitialDataFn(this.tableBody, this.config.dataFields, this.config.entityIdField);
        } else if (this.tableBody) {
             // Default initial data extraction (simplified, might need page-specific logic via extractInitialDataFn)
            this.entitiesData = this._extractDataFromTable();
        }
        
        this.refreshViews();

        if (this.form) {
            this.form.addEventListener('submit', this.handleSubmit.bind(this));
        }

        // Setup global openModal and closeModal if they are part of the page structure
        // This assumes openModal and closeModal are defined globally on the page and call instance methods
        window[`open${this.config.entityNameCap}Modal`] = (modalType, entityId = null) => this.openModal(modalType, entityId);
        window[`close${this.config.entityNameCap}Modal`] = () => this.closeModal();
        
        // Unified delete handler - attach to a common ancestor if possible, or document.body as a fallback.
        // Assumes delete buttons will have a class like 'delete-entity-btn' and 'data-entity-id'
        const container = this.tableBody?.closest('main') || this.cardList?.closest('main') || document.body;
        container.addEventListener('click', (event) => {
            if (event.target.matches(this.config.deleteButtonSelector || '.delete-entity-btn')) {
                const entityId = event.target.dataset.entityId;
                const entity = this.entitiesData.find(e => e.id === entityId);
                const entityDisplayName = entity ? (entity[this.config.displayFieldForDelete || 'name'] || entity.model || this.config.entityName) : this.config.entityName;
                this.handleDelete(entityId, entityDisplayName);
            }
        });

        // Handle Escape key for modal
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                this.closeModal();
            }
        });
    }

    _extractDataFromTable() {
        // Placeholder for a more generic or configurable HTML table parsing logic.
        // This default one is highly dependent on the original cars.html structure
        // and might not work well for other tables without customization via extractInitialDataFn.
        const data = [];
        if (!this.tableBody) return data;

        const rows = Array.from(this.tableBody.querySelectorAll('tr'));
        rows.forEach(row => {
            const editButton = row.querySelector(`button[onclick*="openModal"], button[onclick*="openEdit${this.config.entityNameCap || ''}Modal"]`);
            if (editButton) {
                const onclickAttr = editButton.getAttribute('onclick');
                // Try to extract the object string passed to openModal or openEdit...Modal
                // Example: openModal('editCarModal', {id:'car1', model:'Avanza', ...})
                // Example: openEditBrandModal('Toyota', 'Toyota Mobil', 'brand1')
                let entity = {};
                let entityId = null;
                
                const objectMatch = onclickAttr.match(/openModal\s*\([^,]+,\s*(\{.*?\})\s*\)/) || onclickAttr.match(/openEdit[A-Za-z]+Modal\s*\((.*)\)/);

                if (objectMatch && objectMatch[1]) {
                    let paramsStr = objectMatch[1];
                    if (paramsStr.startsWith('{') && paramsStr.endsWith('}')) { // It's an object string
                        try {
                            // Sanitize string for new Function
                            const sanitizedParamsStr = paramsStr.replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":');
                            entity = new Function('return ' + sanitizedParamsStr)();
                            entityId = entity.id || row.dataset.entityId || `temp-${Date.now()}-${Math.random()}`;
                            if(!entity.id) entity.id = entityId;

                        } catch (e) {
                            console.error("Error parsing entity data from HTML object string:", e, paramsStr);
                            return; // skip this row
                        }
                    } else { // It's a list of parameters (like in brands.html originally)
                        // This part needs to be very specific to the function signature
                        // For brands: openEditBrandModal(name, description, id)
                        const paramsArray = paramsStr.split(',').map(p => p.trim().replace(/^['"]|['"]$/g, ''));
                        if (this.config.dataFields && this.config.dataFields.length + 1 === paramsArray.length) { // +1 for id
                            entity.id = paramsArray[paramsArray.length - 1]; // last param is id
                            this.config.dataFields.forEach((field, index) => {
                                entity[field.name] = paramsArray[index];
                            });
                        } else {
                             console.warn("Parameter mismatch for function:", onclickAttr, "Expected fields:", this.config.dataFields);
                        }
                    }
                } else {
                     // Fallback: try to get data from cells if config.dataFields is provided
                    const cells = Array.from(row.cells);
                    entityId = row.dataset.entityId || editButton.dataset.entityId || `temp-${Date.now()}-${Math.random()}`;
                    entity.id = entityId;
                    if (this.config.dataFields) {
                        this.config.dataFields.forEach((field, index) => {
                             if(cells[index]) entity[field.name] = cells[index].textContent.trim();
                        });
                    }
                }
                
                if (entity.id) { // Only add if we successfully got an ID
                   data.push(entity);
                } else {
                    console.warn("Could not extract entity or ID from row:", row);
                }
            }
        });
         if (this.tableBody) this.tableBody.innerHTML = ''; // Clear static rows
        return data;
    }

    refreshViews() {
        if (this.tableBody && typeof this.config.renderRowFn === 'function') {
            this.tableBody.innerHTML = this.entitiesData.map(entity => this.config.renderRowFn(entity, this.config)).join('');
        }
        if (this.cardList && typeof this.config.renderCardFn === 'function') {
            this.cardList.innerHTML = this.entitiesData.map(entity => this.config.renderCardFn(entity, this.config)).join('');
        }
    }

    openModal(modalType, entityId = null) {
        if (!this.form || !this.modal || !this.idField || !this.modalTitle || !this.submitButton) {
            console.error("Modal components not found. Cannot open modal.");
            return;
        }
        this.form.reset();
        this.idField.value = '';

        const entityNameReadable = this.config.entityNameReadable || (this.config.entityNameCap || 'Item');

        if (modalType.toLowerCase().includes('add')) {
            this.modalTitle.textContent = `Add New ${entityNameReadable}`;
            this.submitButton.textContent = `Add ${entityNameReadable}`;
        } else if (modalType.toLowerCase().includes('edit') && entityId) {
            const entityToEdit = this.entitiesData.find(e => e.id === entityId);
            if (entityToEdit) {
                this.modalTitle.textContent = `Edit ${entityNameReadable}`;
                this.submitButton.textContent = 'Save Changes';
                this.idField.value = entityToEdit.id;
                this.config.dataFields.forEach(field => {
                    const inputElement = this.form.elements[field.name];
                    if (inputElement) {
                        inputElement.value = entityToEdit[field.name] !== undefined ? entityToEdit[field.name] : '';
                    }
                });
            } else {
                alert(this.config.alertMessages.notFound);
                console.error(`${entityNameReadable} not found for editing:`, entityId);
                return;
            }
        }
        this.modal.classList.remove('hidden');
        this.modal.classList.add('flex');
    }

    closeModal() {
        if (this.modal) {
            this.modal.classList.add('hidden');
            this.modal.classList.remove('flex');
        }
    }

    handleSubmit(event) {
        event.preventDefault();
        if (!this.form) return;

        const formData = new FormData(this.form);
        const data = Object.fromEntries(formData.entries());
        const entityId = data[this.config.entityIdField];

        // Type casting based on config.dataFields
        this.config.dataFields.forEach(field => {
            if (data[field.name] !== undefined) {
                if (field.type === 'number') {
                    data[field.name] = parseFloat(data[field.name]);
                } else if (field.type === 'integer') {
                    data[field.name] = parseInt(data[field.name], 10);
                }
            }
        });


        if (entityId) { // Editing
            const entityIndex = this.entitiesData.findIndex(e => e.id === entityId);
            if (entityIndex !== -1) {
                // Create a new object to avoid issues if dataFields doesn't cover all original fields
                const updatedEntity = { ...this.entitiesData[entityIndex] };
                this.config.dataFields.forEach(field => {
                    if (data.hasOwnProperty(field.name)) {
                        updatedEntity[field.name] = data[field.name];
                    }
                });
                 // also update the id field itself from the form, in case it's not part of dataFields but is the entityIdField
                if(data.hasOwnProperty(this.config.entityIdField)){
                     updatedEntity[this.config.entityIdField] = data[this.config.entityIdField];
                     if(this.config.entityIdField !== 'id') updatedEntity.id = data[this.config.entityIdField];
                }

                this.entitiesData[entityIndex] = updatedEntity;
                alert(this.config.alertMessages.updateSuccess || `Updated ${this.config.entityName}.`);
            }
        } else { // Adding
            const newEntity = { id: `${this.config.entityName}-${Date.now()}` };
             this.config.dataFields.forEach(field => {
                if (data.hasOwnProperty(field.name)) {
                    newEntity[field.name] = data[field.name];
                }
            });
            this.entitiesData.push(newEntity);
            alert(this.config.alertMessages.addSuccess || `Added new ${this.config.entityName}.`);
        }
        this.refreshViews();
        this.closeModal();
    }

    handleDelete(entityId, entityName = 'item') {
        const confirmMessage = (this.config.alertMessages.deleteConfirm || `Are you sure you want to delete ${entityName}?`).replace('${entityName}', entityName);
        if (confirm(confirmMessage)) {
            this.entitiesData = this.entitiesData.filter(e => e.id !== entityId);
            this.refreshViews();
            alert((this.config.alertMessages.deleteSuccess || `${entityName} deleted.`).replace('${entityName}', entityName) );
        }
    }
} 