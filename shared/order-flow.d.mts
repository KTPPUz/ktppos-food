type FlowOrder = {status:string;kitchenStatus?:string};
export function kitchenStatus(order:FlowOrder):string;
export function needsService(order:FlowOrder):boolean;
export function serviceOpen(order:FlowOrder):boolean;
