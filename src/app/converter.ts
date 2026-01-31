export interface A2UIComponent {
    id: string;
    type: string;
    properties?: any;
    children?: string[];
}

export interface A2UIData {
    components: A2UIComponent[];
    rootComponentId: string;
    dataModel?: any;
}

export function convertA2UIToAdaptiveCard(a2ui: A2UIData): any {
    const componentMap = new Map<string, A2UIComponent>();
    a2ui.components.forEach(c => componentMap.set(c.id, c));

    const renderComponent = (id: string): any => {
        const comp = componentMap.get(id);
        if (!comp) return null;

        switch (comp.type) {
            case 'Column':
            case 'Form':
                return {
                    type: 'Container',
                    items: (comp.children || []).map(childId => renderComponent(childId)).filter(c => c !== null)
                };
            
            case 'Row':
                return {
                    type: 'ColumnSet',
                    columns: (comp.children || []).map(childId => ({
                        type: 'Column',
                        width: 'stretch',
                        items: [renderComponent(childId)].filter(c => c !== null)
                    }))
                };

            case 'Card':
                return {
                    type: 'Container',
                    style: 'emphasis',
                    bleed: true,
                    separator: true,
                    spacing: 'Medium',
                    items: [
                        {
                            type: 'TextBlock',
                            text: comp.properties?.title || '',
                            weight: 'Bolder',
                            size: 'Large',
                            wrap: true,
                            color: 'Accent'
                        },
                        ...((comp.children || []).map(childId => renderComponent(childId)).filter(c => c !== null))
                    ]
                };

            case 'Text':
                return {
                    type: 'TextBlock',
                    text: comp.properties?.text || '',
                    wrap: true
                };

            case 'Image':
                return {
                    type: 'Image',
                    url: comp.properties?.src || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=500', // Fallback image
                    altText: comp.properties?.alt || 'Image',
                    size: 'Large',
                    style: 'default',
                    horizontalAlignment: 'Center'
                };

            case 'Button':
                return {
                    type: 'ActionSet',
                    actions: [{
                        type: 'Action.Submit',
                        title: comp.properties?.label || 'Click',
                        data: {
                            action: comp.properties?.action
                        }
                    }]
                };

            case 'Input':
                const inputType = comp.properties?.type || 'text';
                if (inputType === 'date') {
                    return { type: 'Input.Date', id: comp.id, placeholder: comp.properties?.placeholder };
                } else if (inputType === 'time') {
                    return { type: 'Input.Time', id: comp.id, placeholder: comp.properties?.placeholder };
                } else if (inputType === 'number') {
                    return { type: 'Input.Number', id: comp.id, placeholder: comp.properties?.placeholder };
                } else {
                    return { type: 'Input.Text', id: comp.id, placeholder: comp.properties?.placeholder };
                }

            default:
                return null;
        }
    };

    const cardBody = renderComponent(a2ui.rootComponentId);

    return {
        type: 'AdaptiveCard',
        version: '1.5',
        body: cardBody ? (cardBody.type === 'Container' ? cardBody.items : [cardBody]) : []
    };
}
