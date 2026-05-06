import Invoice from "../models/contract/invoice.model.js";
import Contract from "../models/contract/contract.model.js";
import { generateInvoiceCode } from "../utils/generators.js";

class InvoiceService {
  async generateMonthlyInvoices(year, month) {
    const monthStr = `${year}-${String(month).padStart(2, "0")}`;
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0);

    const activeContracts = await Contract.find({
      status: "active",
      startDate: { $lte: periodEnd },
      endDate: { $gte: periodStart }
    });

    const results = {
      created: 0,
      skipped: 0,
      errors: []
    };

    for (const contract of activeContracts) {
      try {
        const existingInvoice = await Invoice.findOne({
          contractId: contract._id,
          month: monthStr
        });

        if (existingInvoice) {
          results.skipped++;
          continue;
        }

        const invoiceCode = await generateInvoiceCode();

        const items = [
          {
            type: "room_rent",
            amount: contract.monthlyRent,
            description: `Tiền phòng tháng ${month}/${year}`,
            quantity: 1,
            unitPrice: contract.monthlyRent
          }
        ];

        const dueDate = new Date(year, month - 1, 5);
        if (dueDate < new Date()) {
          dueDate.setDate(dueDate.getDate() + 30);
        }

        const invoice = new Invoice({
          invoiceCode,
          contractId: contract._id,
          studentId: contract.studentId,
          roomId: contract.roomId,
          month: monthStr,
          period: {
            start: periodStart,
            end: periodEnd
          },
          items,
          subTotal: contract.monthlyRent,
          discount: 0,
          totalAmount: contract.monthlyRent,
          dueDate,
          generatedBy: null,
          isFirstInvoice: false
        });

        await invoice.save();
        results.created++;

      } catch (error) {
        results.errors.push({
          contractId: contract._id,
          error: error.message
        });
      }
    }

    return results;
  }

  async generateFirstInvoice(contractId, adminId) {
    const contract = await Contract.findById(contractId);
    if (!contract) {
      throw new Error("Contract not found");
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const monthStr = `${year}-${String(month).padStart(2, "0")}`;

    const existingInvoice = await Invoice.findOne({
      contractId: contract._id,
      month: monthStr
    });

    if (existingInvoice) {
      throw new Error("Invoice already exists for this month");
    }

    const invoiceCode = await generateInvoiceCode();

    const items = [
      {
        type: "deposit",
        amount: contract.depositAmount,
        description: "Tiền đặt cọc",
        quantity: 1,
        unitPrice: contract.depositAmount
      },
      {
        type: "room_rent",
        amount: contract.monthlyRent,
        description: `Tiền phòng tháng ${month}/${year} (tháng đầu)`,
        quantity: 1,
        unitPrice: contract.monthlyRent
      }
    ];

    const subTotal = contract.depositAmount + contract.monthlyRent;

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);

    const invoice = new Invoice({
      invoiceCode,
      contractId: contract._id,
      studentId: contract.studentId,
      roomId: contract.roomId,
      month: monthStr,
      period: {
        start: contract.startDate,
        end: new Date(contract.startDate.getFullYear(), contract.startDate.getMonth() + 1, 0)
      },
      items,
      subTotal,
      discount: 0,
      totalAmount: subTotal,
      dueDate,
      generatedBy: adminId,
      isFirstInvoice: true
    });

    await invoice.save();
    return invoice;
  }

  async markOverdueInvoices() {
    const now = new Date();

    const overdueInvoices = await Invoice.find({
      status: { $in: ["pending", "partial"] },
      dueDate: { $lt: now },
      status: { $ne: "overdue" }
    });

    const results = {
      marked: 0,
      errors: []
    };

    for (const invoice of overdueInvoices) {
      try {
        await invoice.markAsOverdue();
        results.marked++;
      } catch (error) {
        results.errors.push({
          invoiceId: invoice._id,
          error: error.message
        });
      }
    }

    return results;
  }

  async getMonthlyStats(year, month) {
    const monthStr = `${year}-${String(month).padStart(2, "0")}`;
    return await Invoice.getMonthlyStats(monthStr);
  }

  async getStudentBalance(studentId) {
    return await Invoice.getStudentBalance(studentId);
  }
}

export default new InvoiceService();
