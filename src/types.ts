import type {MenuDiscount} from '../shared/pricing.mjs';
export type Role=string;
export type RoleDefinition={id:string;key:string;name:string;menus:string[];permissions:string[];scope:'branch'|'tenant';protected:boolean;members:number};
export type RoleMenu={id:string;label:string;permission:string;plan?:string};
export type User={id:string;tenantId:string;branchId:string;name:string;role:Role;roleName?:string;email:string};
export type PaymentQr={version?:string;image?:string;bankName:string;accountName:string;accountNumber:string;instructions:string;enabled:boolean};
export type Branch={id:string;name:string;tenantId:string;target:number;address?:string;phone?:string;paymentQr?:PaymentQr};
export type MenuItem={soldQuantity?:number;discount?:MenuDiscount;id:string;name:string;en:string;category:string;price:number;image:string;popular:boolean;available:boolean;overrides:Record<string,number>;modifiers:{id:string;name:string;options:{name:string;price:number}[]}[]};
export type KitchenBatch={id:string;round:number;source:string;status:string;createdAt:string;itemIds:string[]};
export type TableSession={id:string;tableId:string;branchId:string;orderIds:string[];active:boolean;acceptingOrders:boolean;expiresAt:string};
export type Item={id:string;menuId:string;name:string;qty:number;batchId?:string;unitPrice:number;originalUnitPrice?:number;menuDiscount?:number;note:string;modifiers:{group:string;name:string;price:number}[];status?:string};
export type Totals={subtotal:number;discount:number;service:number;tax:number;total:number};
export type Order={kitchenStatus?:string;source?:string;kitchenBatches?:KitchenBatch[];serviceSessionId?:string;id:string;number:number;branchId:string;type:string;tableId:string|null;items:Item[];status:string;discount:number;taxRate:number;serviceRate:number;roundingAdjustment?:number;createdAt:string;cancelledItems?: (Item & {reason:string;at:string;userId:string})[];cancelReason?:string;paidAt?:string;totals?:Totals;payment?:{method:string;received:number;change:number;verification?:string;verifiedBy?:string;verifiedAt?:string};receipt?:string;refund?:{reason:string;userId:string;at:string}};
export type Ingredient={id:string;name:string;branchId:string;unit:string;stock:number;minimum:number};
export type Table={id:string;branchId:string;name:string;seats:number;reservation:{name:string;time:string}|null};
export type Transfer={id:string;fromBranchId:string;toBranchId:string;name:string;qty:number;status:string;at:string;approvedAt?:string;requestedBy:string;approvedBy?:string};
export type State={archivedTables?:Table[];roles?:RoleDefinition[];roleMenus?:RoleMenu[];visibleMenus?:string[];customerBaseUrls?:string[];tableSessions:TableSession[];user:User;tenant:{id:string;name:string;plan:string};branches:Branch[];categories:{id:string;name:string;icon:string}[];menu:MenuItem[];orders:Order[];tables:Table[];ingredients:Ingredient[];users:User[];audit:AuditEntry[];transfers:Transfer[];shifts:{id:string;branchId:string;open:boolean;openingCash:number}[];settings:{taxRate:number;serviceRate:number};permissions:string[];recipes:{menuId:string;parts:{index:number;qty:number}[]}[]};

export type AuditEntry={id:string;action:string;detail:string;user:string;role:string;roleName?:string;at:string;branchId:string;changes?:{entity:string;id:string;label:string;type:'create'|'update'|'delete';fields:{key:string;label:string;before:unknown;after:unknown;redacted?:boolean}[]}[]};
