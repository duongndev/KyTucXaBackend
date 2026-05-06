import MeterReading from "../models/contract/meterReading.model.js";
import UtilityRate from "../models/contract/utilityRate.model.js";
import Invoice from "../models/contract/invoice.model.js";
import SemesterInvoice from "../models/contract/semesterInvoice.model.js";
import Contract from "../models/contract/contract.model.js";
import Room from "../models/building/room.model.js";
import RoomService from "../models/contract/roomService.model.js";
import RoomBillingSplit from "../models/contract/roomBillingSplit.model.js";
import StudentBill from "../models/contract/studentBill.model.js";
import { generateInvoiceCode } from "../utils/generators.js";

class UtilityService {
  async calculateUtilityForRoom(roomId, year, month) {
    const monthStr = `${year}-${String(month).padStart(2, "0")}`;

    const reading = await MeterReading.findOne({ roomId, month: monthStr });
    if (!reading) {
      throw new Error(`No meter reading found for room ${roomId} in ${monthStr}`);
    }

    const elecRate = await UtilityRate.getElectricityRate();
    const waterRate = await UtilityRate.getWaterRate();

    if (!elecRate || !waterRate) {
      throw new Error("Utility rates not configured");
    }

    const electricityCost = elecRate.calculateElectricityCost(reading.electricity.usage);
    const waterCost = waterRate.calculateWaterCost(reading.water.usage);

    return {
      reading,
      electricity: {
        usage: reading.electricity.usage,
        cost: electricityCost,
        breakdown: elecRate.getTierBreakdown(reading.electricity.usage)
      },
      water: {
        usage: reading.water.usage,
        cost: waterCost,
        unitPrice: waterRate.unitPrice
      },
      total: electricityCost + waterCost
    };
  }

  async createInvoiceWithUtilities(contractId, year, month, adminId) {
    const monthStr = `${year}-${String(month).padStart(2, "0")}`;

    const contract = await Contract.findById(contractId);
    if (!contract) {
      throw new Error("Contract not found");
    }

    if (contract.status !== "active") {
      throw new Error(`Cannot create invoice for contract with status: ${contract.status}`);
    }

    const existingInvoice = await Invoice.findOne({
      contractId,
      month: monthStr
    });

    if (existingInvoice) {
      throw new Error(`Invoice already exists for ${monthStr}`);
    }

    let utilityData;
    try {
      utilityData = await this.calculateUtilityForRoom(contract.roomId, year, month);
    } catch (error) {
      utilityData = null;
    }

    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0);

    const items = [
      {
        type: "room_rent",
        amount: contract.monthlyRent,
        description: `Tiền phòng tháng ${month}/${year}`,
        quantity: 1,
        unitPrice: contract.monthlyRent
      }
    ];

    let subTotal = contract.monthlyRent;

    if (utilityData) {
      items.push({
        type: "electricity",
        amount: utilityData.electricity.cost,
        description: `Tiền điện tháng ${month}/${year}`,
        quantity: utilityData.electricity.usage,
        unitPrice: null,
        usage: utilityData.electricity.usage,
        meterReading: {
          current: utilityData.reading.electricity.current,
          previous: utilityData.reading.electricity.previous,
          difference: utilityData.reading.electricity.usage
        }
      });

      items.push({
        type: "water",
        amount: utilityData.water.cost,
        description: `Tiền nước tháng ${month}/${year}`,
        quantity: utilityData.water.usage,
        unitPrice: utilityData.water.unitPrice,
        usage: utilityData.water.usage,
        meterReading: {
          current: utilityData.reading.water.current,
          previous: utilityData.reading.water.previous,
          difference: utilityData.reading.water.usage
        }
      });

      subTotal += utilityData.electricity.cost + utilityData.water.cost;

      await MeterReading.findByIdAndUpdate(utilityData.reading._id, {
        status: "billed",
        calculatedAmounts: {
          electricity: utilityData.electricity.cost,
          water: utilityData.water.cost
        }
      });
    }

    const room = await Room.findById(contract.roomId);
    const occupants = room?.currentOccupancy || 1;

    const roomService = await RoomService.findByRoom(contract.roomId);
    if (roomService) {
      const serviceItems = roomService.getInvoiceItems(occupants, year, month);
      items.push(...serviceItems);

      const serviceTotal = serviceItems.reduce((sum, item) => sum + item.amount, 0);
      subTotal += serviceTotal;
    }

    const dueDate = new Date(year, month - 1, 5);
    if (dueDate < new Date()) {
      dueDate.setDate(dueDate.getDate() + 30);
    }

    const invoiceCode = await generateInvoiceCode();

    const invoice = new Invoice({
      invoiceCode,
      contractId,
      studentId: contract.studentId,
      roomId: contract.roomId,
      month: monthStr,
      period: {
        start: periodStart,
        end: periodEnd
      },
      items,
      subTotal,
      discount: 0,
      totalAmount: subTotal,
      dueDate,
      generatedBy: adminId,
      isFirstInvoice: false
    });

    await invoice.save();

    return {
      invoice,
      utilityData
    };
  }

  async generateMonthlyInvoicesWithUtilities(year, month, adminId) {
    const monthStr = `${year}-${String(month).padStart(2, "0")}`;
    const periodEnd = new Date(year, month, 0);

    const activeContracts = await Contract.find({
      status: "active",
      startDate: { $lte: periodEnd }
    });

    const results = {
      created: [],
      skipped: [],
      errors: [],
      noReading: []
    };

    for (const contract of activeContracts) {
      try {
        const existingInvoice = await Invoice.findOne({
          contractId: contract._id,
          month: monthStr
        });

        if (existingInvoice) {
          results.skipped.push({
            contractId: contract._id,
            reason: "Invoice already exists"
          });
          continue;
        }

        const reading = await MeterReading.findOne({
          roomId: contract.roomId,
          month: monthStr,
          status: { $in: ["pending", "verified"] }
        });

        if (!reading) {
          results.noReading.push({
            contractId: contract._id,
            roomId: contract.roomId
          });
          continue;
        }

        const result = await this.createInvoiceWithUtilities(
          contract._id,
          year,
          month,
          adminId
        );

        results.created.push({
          contractId: contract._id,
          invoiceId: result.invoice._id,
          invoiceCode: result.invoice.invoiceCode,
          totalAmount: result.invoice.totalAmount,
          hasUtilities: !!result.utilityData
        });

      } catch (error) {
        results.errors.push({
          contractId: contract._id,
          error: error.message
        });
      }
    }

    return results;
  }

  async getRoomsWithoutReadings(year, month) {
    const monthStr = `${year}-${String(month).padStart(2, "0")}`;

    const activeContracts = await Contract.find({
      status: "active",
      startDate: { $lte: new Date(year, month, 0) }
    }).select("roomId");

    const roomIds = activeContracts.map(c => c.roomId.toString());

    const readings = await MeterReading.find({
      month: monthStr,
      roomId: { $in: roomIds }
    }).select("roomId");

    const readRoomIds = new Set(readings.map(r => r.roomId.toString()));

    const roomsWithoutReadings = roomIds.filter(id => !readRoomIds.has(id));

    const rooms = await Room.find({
      _id: { $in: roomsWithoutReadings }
    }).populate("buildingId", "buildingCode buildingName");

    return rooms;
  }

  async estimateReading(roomId, year, month) {
    const lastReading = await MeterReading.getLastReading(roomId);

    if (!lastReading) {
      throw new Error("No previous reading available for estimation");
    }

    const avgElectricity = await this.getAverageUsage(roomId, "electricity", 3);
    const avgWater = await this.getAverageUsage(roomId, "water", 3);

    const monthStr = `${year}-${String(month).padStart(2, "0")}`;

    const estimatedReading = {
      roomId,
      month: monthStr,
      year,
      electricity: {
        previous: lastReading.electricity.current,
        current: lastReading.electricity.current + avgElectricity,
        meterNumber: lastReading.electricity.meterNumber,
        isEstimated: true
      },
      water: {
        previous: lastReading.water.current,
        current: lastReading.water.current + avgWater,
        meterNumber: lastReading.water.meterNumber,
        isEstimated: true
      },
      readBy: null,
      notes: "Auto-estimated based on average usage",
      isAutoRead: true
    };

    return estimatedReading;
  }

  async getAverageUsage(roomId, type, months = 3) {
    const readings = await MeterReading.findByRoom(roomId, { limit: months });

    if (readings.length === 0) return 0;

    const total = readings.reduce((sum, r) => {
      return sum + (type === "electricity" ? r.electricity.usage : r.water.usage);
    }, 0);

    return Math.round(total / readings.length);
  }

  async getUtilityStats(year, month) {
    const monthStr = `${year}-${String(month).padStart(2, "0")}`;

    const [readingStats, invoiceStats] = await Promise.all([
      MeterReading.getMonthlyStats(year, month),
      Invoice.aggregate([
        { $match: { month: monthStr } },
        { $unwind: "$items" },
        { $match: { "items.type": { $in: ["electricity", "water"] } } },
        {
          $group: {
            _id: "$items.type",
            totalUsage: { $sum: "$items.usage" },
            totalAmount: { $sum: "$items.amount" },
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    const elecInvoice = invoiceStats.find(s => s._id === "electricity");
    const waterInvoice = invoiceStats.find(s => s._id === "water");

    return {
      readings: readingStats[0] || {
        totalElectricityUsage: 0,
        totalWaterUsage: 0,
        avgElectricityUsage: 0,
        avgWaterUsage: 0,
        count: 0
      },
      billing: {
        electricity: {
          totalUsage: elecInvoice?.totalUsage || 0,
          totalAmount: elecInvoice?.totalAmount || 0,
          roomCount: elecInvoice?.count || 0
        },
        water: {
          totalUsage: waterInvoice?.totalUsage || 0,
          totalAmount: waterInvoice?.totalAmount || 0,
          roomCount: waterInvoice?.count || 0
        }
      }
    };
  }

  async splitInvoiceToStudentBills(invoiceId, adminId) {
    const invoice = await Invoice.findById(invoiceId)
      .populate("roomId", "currentOccupancy assignedStudents")
      .populate("contractId");

    if (!invoice) {
      throw new Error("Invoice not found");
    }

    // Check if already split
    const existingBills = await StudentBill.countDocuments({ invoiceId });
    if (existingBills > 0) {
      throw new Error("Invoice has already been split into student bills");
    }

    // Find billing split configuration
    const billingSplit = await RoomBillingSplit.findOne({
      roomId: invoice.roomId._id,
      isActive: true
    });

    // If no billing split config, create equal split
    const occupants = invoice.roomId.currentOccupancy || 1;
    let splitResult;

    if (billingSplit) {
      splitResult = billingSplit.calculateSplit(invoice.items, occupants);
    } else {
      // Create default equal split
      splitResult = this.createDefaultEqualSplit(invoice, occupants);
    }

    const createdBills = [];

    for (const studentId in splitResult) {
      const split = splitResult[studentId];
      const billCode = `STU${invoice.month.replace("-", "")}${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`;

      const bill = new StudentBill({
        billCode,
        invoiceId: invoice._id,
        invoiceCode: invoice.invoiceCode,
        parentInvoiceMonth: invoice.month,
        studentId: split.studentId,
        roomId: invoice.roomId._id,
        contractId: invoice.contractId._id,
        items: split.items.map(item => ({
          type: item.type,
          description: item.description,
          originalAmount: item.originalAmount,
          splitMethod: item.splitMethod,
          amount: item.amount,
          percentage: item.percentage,
          usage: item.usage || null,
          unitPrice: item.unitPrice || null,
          ratio: item.ratio || null
        })),
        subTotal: split.subTotal,
        discount: 0,
        totalAmount: split.total,
        paidAmount: 0,
        remainingAmount: split.total,
        status: "pending",
        dueDate: invoice.dueDate,
        splitConfigId: billingSplit?._id || null,
        percentageOfTotal: split.percentage,
        generatedBy: adminId
      });

      await bill.save();
      createdBills.push(bill);
    }

    return {
      invoiceId,
      totalBillsCreated: createdBills.length,
      bills: createdBills
    };
  }

  createDefaultEqualSplit(invoice, occupants) {
    const result = {};
    const activeStudents = invoice.roomId.assignedStudents || [];
    const equalPercentage = 100 / occupants;

    for (let i = 0; i < occupants; i++) {
      const studentInfo = activeStudents[i];
      const studentId = studentInfo?.studentId?.toString() || `student_${i}`;

      result[studentId] = {
        studentId: studentInfo?.studentId,
        items: [],
        subTotal: 0,
        percentage: equalPercentage
      };

      for (const item of invoice.items) {
        const equalAmount = Math.round(item.amount / occupants);
        const remainder = item.amount - (equalAmount * occupants);
        const finalAmount = i === 0 ? equalAmount + remainder : equalAmount;

        result[studentId].items.push({
          type: item.type,
          description: item.description,
          originalAmount: item.amount,
          splitMethod: "equal",
          amount: finalAmount,
          percentage: equalPercentage,
          usage: item.usage || null,
          unitPrice: item.unitPrice || null
        });

        result[studentId].subTotal += finalAmount;
      }

      result[studentId].total = result[studentId].subTotal;
    }

    return result;
  }

  async generateSplitInvoices(year, month, adminId) {
    const monthStr = `${year}-${String(month).padStart(2, "0")}`;
    const periodEnd = new Date(year, month, 0);

    const activeContracts = await Contract.find({
      status: "active",
      startDate: { $lte: periodEnd }
    });

    const results = {
      created: [],
      skipped: [],
      errors: []
    };

    for (const contract of activeContracts) {
      try {
        // Create main invoice with utilities and services
        const invoiceResult = await this.createInvoiceWithUtilities(
          contract._id,
          year,
          month,
          adminId
        );

        // Split into student bills
        const splitResult = await this.splitInvoiceToStudentBills(
          invoiceResult.invoice._id,
          adminId
        );

        results.created.push({
          contractId: contract._id,
          invoiceId: invoiceResult.invoice._id,
          invoiceCode: invoiceResult.invoice.invoiceCode,
          studentBills: splitResult.bills.map(b => ({
            billId: b._id,
            billCode: b.billCode,
            studentId: b.studentId,
            amount: b.totalAmount
          }))
        });

      } catch (error) {
        results.errors.push({
          contractId: contract._id,
          error: error.message
        });
      }
    }

    return results;
  }

  // ==================== ROOM RENT INVOICE (6 MONTHS - ROOM RENT ONLY) ====================

  async createRoomRentInvoices(year, periodNumber, billingCycle = "6month", adminId) {
    // Calculate period dates using the model's helper
    const periodDates = SemesterInvoice.calculatePeriodDates(year, periodNumber, billingCycle);
    const { startDate, endDate, durationMonths, periodName } = periodDates;

    const startMonth = startDate.getMonth() + 1;
    const endMonth = endDate.getMonth() + 1;

    const activeContracts = await Contract.find({
      status: "active",
      startDate: { $lte: endDate }
    }).populate("roomId", "currentOccupancy assignedStudents pricePerMonth");

    const results = {
      created: [],
      skipped: [],
      errors: []
    };

    for (const contract of activeContracts) {
      try {
        const room = contract.roomId;
        const monthlyRent = room.pricePerMonth || contract.monthlyRent;
        const totalRoomRent = monthlyRent * durationMonths;

        // Check if invoice already exists for this period
        const existingInvoice = await SemesterInvoice.findOne({
          contractId: contract._id,
          year,
          billingCycle,
          periodNumber
        });

        if (existingInvoice) {
          results.skipped.push({
            contractId: contract._id,
            reason: "Room rent invoice already exists for this period"
          });
          continue;
        }

        // Create invoice for each student in the room
        // Mỗi người trả full tiền phòng (KHÔNG chia)
        const assignedStudents = room.assignedStudents || [];
        const occupants = room.currentOccupancy || assignedStudents.length || 1;

        for (const assignedStudent of assignedStudents) {
          const studentId = assignedStudent.studentId;

          // Mỗi người trả FULL tiền phòng (không chia)
          const finalAmount = totalRoomRent;

          // Generate invoice code: RENT + year + period + random
          const invoiceCode = `RENT${year}${String(periodNumber).padStart(2, "0")}${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`;

          const roomRentInvoice = new SemesterInvoice({
            invoiceCode,
            contractId: contract._id,
            studentId,
            roomId: room._id,
            billingCycle,
            periodName,
            year,
            periodNumber,
            period: {
              startDate,
              endDate,
              durationMonths
            },
            roomRent: {
              monthlyRate: monthlyRent,
              totalMonths: durationMonths,
              subTotal: totalRoomRent,
              discount: 0,
              totalAmount: finalAmount
            },
            status: "pending",
            dueDate: new Date(startDate.getFullYear(), startDate.getMonth(), 15), // Due 15th of first month
            splitInfo: {
              isSplit: false, // Không chia tiền phòng
              totalRoommates: occupants,
              myShare: 100, // Mỗi người trả 100%
              originalTotal: totalRoomRent
            },
            notes: "Tiền phòng: Mỗi người trả full (không chia)",
            generatedBy: adminId
          });

          await roomRentInvoice.save();
          results.created.push({
            contractId: contract._id,
            studentId,
            invoiceId: roomRentInvoice._id,
            invoiceCode: roomRentInvoice.invoiceCode,
            periodName,
            amount: finalAmount,
            billingCycle,
            durationMonths,
            perPerson: true // Đánh dấu là trả theo người, không chia
          });
        }

      } catch (error) {
        results.errors.push({
          contractId: contract._id,
          error: error.message
        });
      }
    }

    return results;
  }

  // Helper to create 6-month room rent invoices (most common use case)
  async create6MonthRoomRentInvoices(year, periodNumber, adminId) {
    return this.createRoomRentInvoices(year, periodNumber, "6month", adminId);
  }

  // ==================== MONTHLY INVOICE (UTILITIES & SERVICES ONLY) ====================

  async createMonthlyUtilitiesInvoice(contractId, year, month, adminId) {
    const monthStr = `${year}-${String(month).padStart(2, "0")}`;

    const contract = await Contract.findById(contractId).populate("roomId", "currentOccupancy assignedStudents pricePerMonth");
    if (!contract) {
      throw new Error("Contract not found");
    }

    if (contract.status !== "active") {
      throw new Error(`Contract is not active: ${contract.status}`);
    }

    // Check if monthly invoice already exists
    const existingInvoice = await Invoice.findOne({
      contractId,
      month: monthStr
    });

    if (existingInvoice) {
      throw new Error(`Monthly invoice already exists for ${monthStr}`);
    }

    const room = contract.roomId;
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0);

    // Build items - ONLY utilities and services, NO room rent
    const items = [];
    let subTotal = 0;

    // 1. Electricity
    try {
      const utilityData = await this.calculateUtilityForRoom(room._id, year, month);
      if (utilityData) {
        items.push({
          type: "electricity",
          amount: utilityData.electricity.cost,
          description: `Tiền điện tháng ${month}/${year}`,
          quantity: utilityData.electricity.usage,
          unitPrice: null,
          usage: utilityData.electricity.usage,
          meterReading: {
            current: utilityData.reading.electricity.current,
            previous: utilityData.reading.electricity.previous,
            difference: utilityData.reading.electricity.usage
          }
        });
        subTotal += utilityData.electricity.cost;

        items.push({
          type: "water",
          amount: utilityData.water.cost,
          description: `Tiền nước tháng ${month}/${year}`,
          quantity: utilityData.water.usage,
          unitPrice: utilityData.water.unitPrice,
          usage: utilityData.water.usage,
          meterReading: {
            current: utilityData.reading.water.current,
            previous: utilityData.reading.water.previous,
            difference: utilityData.reading.water.usage
          }
        });
        subTotal += utilityData.water.cost;

        // Mark meter reading as billed
        await MeterReading.findByIdAndUpdate(utilityData.reading._id, {
          status: "billed",
          calculatedAmounts: {
            electricity: utilityData.electricity.cost,
            water: utilityData.water.cost
          }
        });
      }
    } catch (error) {
      // No meter reading available, skip utilities
    }

    // 2. Services
    const roomService = await RoomService.findByRoom(room._id);
    if (roomService) {
      const occupants = room.currentOccupancy || 1;
      const serviceItems = roomService.getInvoiceItems(occupants, year, month);
      items.push(...serviceItems);
      subTotal += serviceItems.reduce((sum, item) => sum + item.amount, 0);
    }

    // Create invoice ONLY if there are utility/service charges
    if (items.length === 0) {
      return { message: "No utility or service charges for this month", invoice: null };
    }

    const invoiceCode = await generateInvoiceCode();
    const dueDate = new Date(year, month - 1, 5);
    if (dueDate < new Date()) {
      dueDate.setDate(dueDate.getDate() + 30);
    }

    const invoice = new Invoice({
      invoiceCode,
      contractId,
      studentId: contract.studentId,
      roomId: room._id,
      month: monthStr,
      period: { start: periodStart, end: periodEnd },
      items,
      subTotal,
      discount: 0,
      totalAmount: subTotal,
      dueDate,
      generatedBy: adminId,
      isFirstInvoice: false
    });

    await invoice.save();

    // Split into student bills if room has multiple occupants
    const splitResult = await this.splitMonthlyInvoiceToStudentBills(invoice._id, adminId);

    return {
      invoice,
      splitResult
    };
  }

  async splitMonthlyInvoiceToStudentBills(invoiceId, adminId) {
    const invoice = await Invoice.findById(invoiceId)
      .populate("roomId", "currentOccupancy assignedStudents")
      .populate("contractId");

    if (!invoice) {
      throw new Error("Invoice not found");
    }

    const room = invoice.roomId;
    const occupants = room.currentOccupancy || 1;

    // Get billing split configuration
    const billingSplit = await RoomBillingSplit.findOne({
      roomId: room._id,
      isActive: true
    });

    let splitResult;
    if (billingSplit) {
      splitResult = billingSplit.calculateSplit(invoice.items, occupants);
    } else {
      splitResult = this.createDefaultEqualSplitForUtilities(invoice, occupants);
    }

    const createdBills = [];

    for (const studentId in splitResult) {
      const split = splitResult[studentId];
      const billCode = `UTL${invoice.month.replace("-", "")}${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`;

      const bill = new StudentBill({
        billCode,
        invoiceId: invoice._id,
        invoiceCode: invoice.invoiceCode,
        parentInvoiceMonth: invoice.month,
        studentId: split.studentId,
        roomId: room._id,
        contractId: invoice.contractId._id,
        items: split.items.map(item => ({
          type: item.type,
          description: item.description,
          originalAmount: item.originalAmount,
          splitMethod: item.splitMethod,
          amount: item.amount,
          percentage: item.percentage,
          usage: item.usage || null,
          unitPrice: item.unitPrice || null
        })),
        subTotal: split.subTotal,
        discount: 0,
        totalAmount: split.total,
        paidAmount: 0,
        remainingAmount: split.total,
        status: "pending",
        dueDate: invoice.dueDate,
        splitConfigId: billingSplit?._id || null,
        percentageOfTotal: split.percentage,
        generatedBy: adminId
      });

      await bill.save();
      createdBills.push(bill);
    }

    return {
      invoiceId,
      totalBillsCreated: createdBills.length,
      bills: createdBills
    };
  }

  createDefaultEqualSplitForUtilities(invoice, occupants) {
    const result = {};
    const activeStudents = invoice.roomId.assignedStudents || [];
    const equalPercentage = 100 / occupants;

    for (let i = 0; i < occupants; i++) {
      const studentInfo = activeStudents[i];
      const studentId = studentInfo?.studentId?.toString() || `student_${i}`;

      result[studentId] = {
        studentId: studentInfo?.studentId,
        items: [],
        subTotal: 0,
        percentage: equalPercentage
      };

      for (const item of invoice.items) {
        const equalAmount = Math.round(item.amount / occupants);
        const remainder = item.amount - (equalAmount * occupants);
        const finalAmount = i === 0 ? equalAmount + remainder : equalAmount;

        result[studentId].items.push({
          type: item.type,
          description: item.description,
          originalAmount: item.amount,
          splitMethod: "equal",
          amount: finalAmount,
          percentage: equalPercentage,
          usage: item.usage || null,
          unitPrice: item.unitPrice || null
        });

        result[studentId].subTotal += finalAmount;
      }

      result[studentId].total = result[studentId].subTotal;
    }

    return result;
  }

  // ==================== GENERATE BOTH TYPES FOR A MONTH ====================

  async generateMonthlyBilling(year, month, adminId, billingCycle = "6month") {
    const results = {
      roomRentInvoices: { created: [], skipped: [], errors: [] },
      monthlyInvoices: { created: [], skipped: [], errors: [] }
    };

    // Check if this is the start of a new billing period
    // For 6-month cycle: months 1 and 7
    // For 3-month cycle: months 1, 4, 7, 10
    // For 12-month cycle: month 1
    let isPeriodStart = false;
    let periodNumber = 1;

    switch (billingCycle) {
      case "6month":
        isPeriodStart = [1, 7].includes(month);
        periodNumber = month <= 6 ? 1 : 2;
        break;
      case "3month":
        isPeriodStart = [1, 4, 7, 10].includes(month);
        periodNumber = Math.ceil(month / 3);
        break;
      case "12month":
        isPeriodStart = month === 1;
        periodNumber = 1;
        break;
      default:
        isPeriodStart = [1, 7].includes(month);
        periodNumber = month <= 6 ? 1 : 2;
    }

    // Create room rent invoices at period start
    if (isPeriodStart) {
      try {
        const roomRentResult = await this.createRoomRentInvoices(
          year,
          periodNumber,
          billingCycle,
          adminId
        );
        results.roomRentInvoices = roomRentResult;
      } catch (error) {
        results.roomRentInvoices.errors.push({ error: error.message });
      }
    }

    // Generate monthly utilities invoices (always run every month)
    const activeContracts = await Contract.find({
      status: "active",
      startDate: { $lte: new Date(year, month, 0) }
    });

    for (const contract of activeContracts) {
      try {
        const monthlyResult = await this.createMonthlyUtilitiesInvoice(
          contract._id,
          year,
          month,
          adminId
        );

        if (monthlyResult.invoice) {
          results.monthlyInvoices.created.push({
            contractId: contract._id,
            invoiceId: monthlyResult.invoice._id,
            invoiceCode: monthlyResult.invoice.invoiceCode,
            totalAmount: monthlyResult.invoice.totalAmount,
            studentBills: monthlyResult.splitResult?.bills?.map(b => ({
              billId: b._id,
              billCode: b.billCode,
              studentId: b.studentId,
              amount: b.totalAmount
            })) || []
          });
        } else {
          results.monthlyInvoices.skipped.push({
            contractId: contract._id,
            reason: monthlyResult.message || "No charges"
          });
        }
      } catch (error) {
        results.monthlyInvoices.errors.push({
          contractId: contract._id,
          error: error.message
        });
      }
    }

    return results;
  }

  // Helper to determine period info from month
  getPeriodInfoFromMonth(month, billingCycle = "6month") {
    switch (billingCycle) {
      case "6month":
        return {
          isPeriodStart: [1, 7].includes(month),
          periodNumber: month <= 6 ? 1 : 2,
          periodName: month <= 6 ? "T1-T6" : "T7-T12"
        };
      case "3month":
        return {
          isPeriodStart: [1, 4, 7, 10].includes(month),
          periodNumber: Math.ceil(month / 3),
          periodName: `Q${Math.ceil(month / 3)}`
        };
      case "12month":
        return {
          isPeriodStart: month === 1,
          periodNumber: 1,
          periodName: "Full Year"
        };
      default:
        return {
          isPeriodStart: [1, 7].includes(month),
          periodNumber: month <= 6 ? 1 : 2,
          periodName: month <= 6 ? "T1-T6" : "T7-T12"
        };
    }
  }
}

export default new UtilityService();
