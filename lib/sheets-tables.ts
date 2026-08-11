import { ColumnDef, SheetTable } from "./sheets";

export type VendorRecord = {
  id: string;
  code: string;
  name: string;
  taxId: string | null;
  address: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  creditDays: number;
  bankName: string | null;
  bankBranch: string | null;
  bankAccountNo: string | null;
  bankAccountName: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export const VENDOR_TAB_NAME = "Vendors";

export const VENDOR_COLUMNS: ColumnDef[] = [
  { key: "id", type: "string" },
  { key: "code", type: "string" },
  { key: "name", type: "string" },
  { key: "taxId", type: "string" },
  { key: "address", type: "string" },
  { key: "contactPerson", type: "string" },
  { key: "phone", type: "string" },
  { key: "email", type: "string" },
  { key: "creditDays", type: "number" },
  { key: "bankName", type: "string" },
  { key: "bankBranch", type: "string" },
  { key: "bankAccountNo", type: "string" },
  { key: "bankAccountName", type: "string" },
  { key: "isActive", type: "boolean" },
  { key: "createdAt", type: "date" },
  { key: "updatedAt", type: "date" },
];

export const vendorsTable = new SheetTable<VendorRecord>(VENDOR_TAB_NAME, VENDOR_COLUMNS);

export type ChartOfAccountRecord = {
  id: string;
  code: string;
  name: string;
  type: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export const CHART_OF_ACCOUNT_TAB_NAME = "ChartOfAccounts";

export const CHART_OF_ACCOUNT_COLUMNS: ColumnDef[] = [
  { key: "id", type: "string" },
  { key: "code", type: "string" },
  { key: "name", type: "string" },
  { key: "type", type: "string" },
  { key: "isActive", type: "boolean" },
  { key: "createdAt", type: "date" },
  { key: "updatedAt", type: "date" },
];

export const chartOfAccountsTable = new SheetTable<ChartOfAccountRecord>(
  CHART_OF_ACCOUNT_TAB_NAME,
  CHART_OF_ACCOUNT_COLUMNS
);

export type ProductRecord = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  unit: string | null;
  accountId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export const PRODUCT_TAB_NAME = "Products";

export const PRODUCT_COLUMNS: ColumnDef[] = [
  { key: "id", type: "string" },
  { key: "code", type: "string" },
  { key: "name", type: "string" },
  { key: "description", type: "string" },
  { key: "unit", type: "string" },
  { key: "accountId", type: "string" },
  { key: "isActive", type: "boolean" },
  { key: "createdAt", type: "date" },
  { key: "updatedAt", type: "date" },
];

export const productsTable = new SheetTable<ProductRecord>(PRODUCT_TAB_NAME, PRODUCT_COLUMNS);

export type CompanyBankAccountRecord = {
  id: string;
  bankName: string;
  branch: string | null;
  accountNo: string;
  accountName: string;
  openingBalance: number;
  isActive: boolean;
  createdAt: Date;
};

export const COMPANY_BANK_ACCOUNT_TAB_NAME = "CompanyBankAccounts";

export const COMPANY_BANK_ACCOUNT_COLUMNS: ColumnDef[] = [
  { key: "id", type: "string" },
  { key: "bankName", type: "string" },
  { key: "branch", type: "string" },
  { key: "accountNo", type: "string" },
  { key: "accountName", type: "string" },
  { key: "openingBalance", type: "number" },
  { key: "isActive", type: "boolean" },
  { key: "createdAt", type: "date" },
];

export const companyBankAccountsTable = new SheetTable<CompanyBankAccountRecord>(
  COMPANY_BANK_ACCOUNT_TAB_NAME,
  COMPANY_BANK_ACCOUNT_COLUMNS
);

// Deliberately excludes `password` (bcrypt hash) — auth.ts keeps reading/writing Postgres only.
export type UserRecord = {
  id: string;
  name: string;
  email: string;
  role: string;
  level: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export const USER_TAB_NAME = "Users";

export const USER_COLUMNS: ColumnDef[] = [
  { key: "id", type: "string" },
  { key: "name", type: "string" },
  { key: "email", type: "string" },
  { key: "role", type: "string" },
  { key: "level", type: "string" },
  { key: "isActive", type: "boolean" },
  { key: "createdAt", type: "date" },
  { key: "updatedAt", type: "date" },
];

export const usersTable = new SheetTable<UserRecord>(USER_TAB_NAME, USER_COLUMNS);

export type PurchaseOrderRecord = {
  id: string;
  poNumber: string;
  prNumber: string | null;
  vendorId: string;
  orderDate: Date;
  expectedDate: Date | null;
  status: string;
  totalAmount: number;
  vatRate: number;
  vatAmount: number;
  notes: string | null;
  createdByName: string | null;
  createdById: string | null;
  approvedByName: string | null;
  approvedById: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export const PURCHASE_ORDER_TAB_NAME = "PurchaseOrders";

export const PURCHASE_ORDER_COLUMNS: ColumnDef[] = [
  { key: "id", type: "string" },
  { key: "poNumber", type: "string" },
  { key: "prNumber", type: "string" },
  { key: "vendorId", type: "string" },
  { key: "orderDate", type: "date" },
  { key: "expectedDate", type: "date" },
  { key: "status", type: "string" },
  { key: "totalAmount", type: "number" },
  { key: "vatRate", type: "number" },
  { key: "vatAmount", type: "number" },
  { key: "notes", type: "string" },
  { key: "createdByName", type: "string" },
  { key: "createdById", type: "string" },
  { key: "approvedByName", type: "string" },
  { key: "approvedById", type: "string" },
  { key: "approvedAt", type: "date" },
  { key: "createdAt", type: "date" },
  { key: "updatedAt", type: "date" },
];

export const purchaseOrdersTable = new SheetTable<PurchaseOrderRecord>(
  PURCHASE_ORDER_TAB_NAME,
  PURCHASE_ORDER_COLUMNS
);

export type POItemRecord = {
  id: string;
  poId: string;
  productId: string | null;
  description: string;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  totalPrice: number;
};

export const PO_ITEM_TAB_NAME = "POItems";

export const PO_ITEM_COLUMNS: ColumnDef[] = [
  { key: "id", type: "string" },
  { key: "poId", type: "string" },
  { key: "productId", type: "string" },
  { key: "description", type: "string" },
  { key: "quantity", type: "number" },
  { key: "unit", type: "string" },
  { key: "unitPrice", type: "number" },
  { key: "totalPrice", type: "number" },
];

export const poItemsTable = new SheetTable<POItemRecord>(PO_ITEM_TAB_NAME, PO_ITEM_COLUMNS);

export type GoodsReceiptRecord = {
  id: string;
  grNumber: string;
  poId: string;
  receivedDate: Date;
  receivedBy: string | null;
  notes: string | null;
  createdByName: string | null;
  createdById: string | null;
  createdAt: Date;
};

export const GOODS_RECEIPT_TAB_NAME = "GoodsReceipts";

export const GOODS_RECEIPT_COLUMNS: ColumnDef[] = [
  { key: "id", type: "string" },
  { key: "grNumber", type: "string" },
  { key: "poId", type: "string" },
  { key: "receivedDate", type: "date" },
  { key: "receivedBy", type: "string" },
  { key: "notes", type: "string" },
  { key: "createdByName", type: "string" },
  { key: "createdById", type: "string" },
  { key: "createdAt", type: "date" },
];

export const goodsReceiptsTable = new SheetTable<GoodsReceiptRecord>(
  GOODS_RECEIPT_TAB_NAME,
  GOODS_RECEIPT_COLUMNS
);

export type GoodsReceiptItemRecord = {
  id: string;
  grId: string;
  poItemId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

export const GOODS_RECEIPT_ITEM_TAB_NAME = "GoodsReceiptItems";

export const GOODS_RECEIPT_ITEM_COLUMNS: ColumnDef[] = [
  { key: "id", type: "string" },
  { key: "grId", type: "string" },
  { key: "poItemId", type: "string" },
  { key: "quantity", type: "number" },
  { key: "unitPrice", type: "number" },
  { key: "totalPrice", type: "number" },
];

export const goodsReceiptItemsTable = new SheetTable<GoodsReceiptItemRecord>(
  GOODS_RECEIPT_ITEM_TAB_NAME,
  GOODS_RECEIPT_ITEM_COLUMNS
);

export type AccountsPayableRecord = {
  id: string;
  apNumber: string;
  vendorId: string;
  poId: string | null;
  grId: string | null;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date;
  amount: number;
  vatAmount: number;
  totalAmount: number;
  status: string;
  notes: string | null;
  createdByName: string | null;
  createdById: string | null;
  approvedByName: string | null;
  approvedById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export const ACCOUNTS_PAYABLE_TAB_NAME = "AccountsPayable";

export const ACCOUNTS_PAYABLE_COLUMNS: ColumnDef[] = [
  { key: "id", type: "string" },
  { key: "apNumber", type: "string" },
  { key: "vendorId", type: "string" },
  { key: "poId", type: "string" },
  { key: "grId", type: "string" },
  { key: "invoiceNumber", type: "string" },
  { key: "invoiceDate", type: "date" },
  { key: "dueDate", type: "date" },
  { key: "amount", type: "number" },
  { key: "vatAmount", type: "number" },
  { key: "totalAmount", type: "number" },
  { key: "status", type: "string" },
  { key: "notes", type: "string" },
  { key: "createdByName", type: "string" },
  { key: "createdById", type: "string" },
  { key: "approvedByName", type: "string" },
  { key: "approvedById", type: "string" },
  { key: "createdAt", type: "date" },
  { key: "updatedAt", type: "date" },
];

export const accountsPayableTable = new SheetTable<AccountsPayableRecord>(
  ACCOUNTS_PAYABLE_TAB_NAME,
  ACCOUNTS_PAYABLE_COLUMNS
);

export type PaymentPrepRecord = {
  id: string;
  prepNumber: string;
  prepDate: Date;
  paymentDate: Date;
  totalAmount: number;
  totalWithholdingTax: number;
  netPayableAmount: number;
  status: string;
  notes: string | null;
  createdByName: string | null;
  createdById: string | null;
  approvedByName: string | null;
  approvedById: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export const PAYMENT_PREP_TAB_NAME = "PaymentPreps";

export const PAYMENT_PREP_COLUMNS: ColumnDef[] = [
  { key: "id", type: "string" },
  { key: "prepNumber", type: "string" },
  { key: "prepDate", type: "date" },
  { key: "paymentDate", type: "date" },
  { key: "totalAmount", type: "number" },
  { key: "totalWithholdingTax", type: "number" },
  { key: "netPayableAmount", type: "number" },
  { key: "status", type: "string" },
  { key: "notes", type: "string" },
  { key: "createdByName", type: "string" },
  { key: "createdById", type: "string" },
  { key: "approvedByName", type: "string" },
  { key: "approvedById", type: "string" },
  { key: "approvedAt", type: "date" },
  { key: "createdAt", type: "date" },
  { key: "updatedAt", type: "date" },
];

export const paymentPrepsTable = new SheetTable<PaymentPrepRecord>(
  PAYMENT_PREP_TAB_NAME,
  PAYMENT_PREP_COLUMNS
);

export type PaymentPrepItemRecord = {
  id: string;
  prepId: string;
  apId: string;
  amount: number;
  withholdingTaxRate: number;
  withholdingTaxAmount: number;
  netAmount: number;
};

export const PAYMENT_PREP_ITEM_TAB_NAME = "PaymentPrepItems";

export const PAYMENT_PREP_ITEM_COLUMNS: ColumnDef[] = [
  { key: "id", type: "string" },
  { key: "prepId", type: "string" },
  { key: "apId", type: "string" },
  { key: "amount", type: "number" },
  { key: "withholdingTaxRate", type: "number" },
  { key: "withholdingTaxAmount", type: "number" },
  { key: "netAmount", type: "number" },
];

export const paymentPrepItemsTable = new SheetTable<PaymentPrepItemRecord>(
  PAYMENT_PREP_ITEM_TAB_NAME,
  PAYMENT_PREP_ITEM_COLUMNS
);

export type PaymentRecord = {
  id: string;
  paymentNumber: string;
  prepId: string;
  paymentDate: Date;
  paymentMethod: string;
  companyBankAccountId: string;
  amount: number;
  referenceNumber: string | null;
  notes: string | null;
  createdByName: string | null;
  createdById: string | null;
  createdAt: Date;
};

export const PAYMENT_TAB_NAME = "Payments";

export const PAYMENT_COLUMNS: ColumnDef[] = [
  { key: "id", type: "string" },
  { key: "paymentNumber", type: "string" },
  { key: "prepId", type: "string" },
  { key: "paymentDate", type: "date" },
  { key: "paymentMethod", type: "string" },
  { key: "companyBankAccountId", type: "string" },
  { key: "amount", type: "number" },
  { key: "referenceNumber", type: "string" },
  { key: "notes", type: "string" },
  { key: "createdByName", type: "string" },
  { key: "createdById", type: "string" },
  { key: "createdAt", type: "date" },
];

export const paymentsTable = new SheetTable<PaymentRecord>(PAYMENT_TAB_NAME, PAYMENT_COLUMNS);

export type CustomerRecord = {
  id: string;
  code: string;
  name: string;
  taxId: string | null;
  address: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  creditDays: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export const CUSTOMER_TAB_NAME = "Customers";

export const CUSTOMER_COLUMNS: ColumnDef[] = [
  { key: "id", type: "string" },
  { key: "code", type: "string" },
  { key: "name", type: "string" },
  { key: "taxId", type: "string" },
  { key: "address", type: "string" },
  { key: "contactPerson", type: "string" },
  { key: "phone", type: "string" },
  { key: "email", type: "string" },
  { key: "creditDays", type: "number" },
  { key: "isActive", type: "boolean" },
  { key: "createdAt", type: "date" },
  { key: "updatedAt", type: "date" },
];

export const customersTable = new SheetTable<CustomerRecord>(CUSTOMER_TAB_NAME, CUSTOMER_COLUMNS);

export type SalesInvoiceRecord = {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date;
  customerId: string;
  amount: number;
  vatAmount: number;
  totalAmount: number;
  status: string;
  notes: string | null;
  createdByName: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export const SALES_INVOICE_TAB_NAME = "SalesInvoices";

export const SALES_INVOICE_COLUMNS: ColumnDef[] = [
  { key: "id", type: "string" },
  { key: "invoiceNumber", type: "string" },
  { key: "invoiceDate", type: "date" },
  { key: "dueDate", type: "date" },
  { key: "customerId", type: "string" },
  { key: "amount", type: "number" },
  { key: "vatAmount", type: "number" },
  { key: "totalAmount", type: "number" },
  { key: "status", type: "string" },
  { key: "notes", type: "string" },
  { key: "createdByName", type: "string" },
  { key: "createdById", type: "string" },
  { key: "createdAt", type: "date" },
  { key: "updatedAt", type: "date" },
];

export const salesInvoicesTable = new SheetTable<SalesInvoiceRecord>(
  SALES_INVOICE_TAB_NAME,
  SALES_INVOICE_COLUMNS
);

export type ReceiptRecord = {
  id: string;
  receiptNumber: string;
  receiptDate: Date;
  recordedDate: Date;
  companyBankAccountId: string;
  paymentMethod: string;
  referenceNumber: string | null;
  totalAmount: number;
  feeAmount: number;
  withholdingTaxAmount: number;
  withholdingTaxCertNumber: string | null;
  actualReceivedAmount: number;
  shortageOrExcessAmount: number;
  status: string;
  notes: string | null;
  createdByName: string | null;
  createdById: string | null;
  approvedByName: string | null;
  approvedById: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export const RECEIPT_TAB_NAME = "Receipts";

export const RECEIPT_COLUMNS: ColumnDef[] = [
  { key: "id", type: "string" },
  { key: "receiptNumber", type: "string" },
  { key: "receiptDate", type: "date" },
  { key: "recordedDate", type: "date" },
  { key: "companyBankAccountId", type: "string" },
  { key: "paymentMethod", type: "string" },
  { key: "referenceNumber", type: "string" },
  { key: "totalAmount", type: "number" },
  { key: "feeAmount", type: "number" },
  { key: "withholdingTaxAmount", type: "number" },
  { key: "withholdingTaxCertNumber", type: "string" },
  { key: "actualReceivedAmount", type: "number" },
  { key: "shortageOrExcessAmount", type: "number" },
  { key: "status", type: "string" },
  { key: "notes", type: "string" },
  { key: "createdByName", type: "string" },
  { key: "createdById", type: "string" },
  { key: "approvedByName", type: "string" },
  { key: "approvedById", type: "string" },
  { key: "approvedAt", type: "date" },
  { key: "createdAt", type: "date" },
  { key: "updatedAt", type: "date" },
];

export const receiptsTable = new SheetTable<ReceiptRecord>(RECEIPT_TAB_NAME, RECEIPT_COLUMNS);

export type ReceiptItemRecord = {
  id: string;
  receiptId: string;
  invoiceId: string;
  amount: number;
};

export const RECEIPT_ITEM_TAB_NAME = "ReceiptItems";

export const RECEIPT_ITEM_COLUMNS: ColumnDef[] = [
  { key: "id", type: "string" },
  { key: "receiptId", type: "string" },
  { key: "invoiceId", type: "string" },
  { key: "amount", type: "number" },
];

export const receiptItemsTable = new SheetTable<ReceiptItemRecord>(
  RECEIPT_ITEM_TAB_NAME,
  RECEIPT_ITEM_COLUMNS
);

export type DebitCreditNoteRecord = {
  id: string;
  noteNumber: string;
  type: string;
  noteDate: Date;
  invoiceId: string;
  amount: number;
  vatAmount: number;
  totalAmount: number;
  reason: string | null;
  status: string;
  notes: string | null;
  createdByName: string | null;
  createdById: string | null;
  approvedByName: string | null;
  approvedById: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  detail: string | null;
};

export const DEBIT_CREDIT_NOTE_TAB_NAME = "DebitCreditNotes";

export const DEBIT_CREDIT_NOTE_COLUMNS: ColumnDef[] = [
  { key: "id", type: "string" },
  { key: "noteNumber", type: "string" },
  { key: "type", type: "string" },
  { key: "noteDate", type: "date" },
  { key: "invoiceId", type: "string" },
  { key: "amount", type: "number" },
  { key: "vatAmount", type: "number" },
  { key: "totalAmount", type: "number" },
  { key: "reason", type: "string" },
  { key: "status", type: "string" },
  { key: "notes", type: "string" },
  { key: "createdByName", type: "string" },
  { key: "createdById", type: "string" },
  { key: "approvedByName", type: "string" },
  { key: "approvedById", type: "string" },
  { key: "approvedAt", type: "date" },
  { key: "createdAt", type: "date" },
  { key: "updatedAt", type: "date" },
  // Appended after the fact — keep at the end so existing sheet rows (written under the
  // old column order) don't have their later columns misaligned by an insert in the middle.
  { key: "detail", type: "string" },
];

export const debitCreditNotesTable = new SheetTable<DebitCreditNoteRecord>(
  DEBIT_CREDIT_NOTE_TAB_NAME,
  DEBIT_CREDIT_NOTE_COLUMNS
);
