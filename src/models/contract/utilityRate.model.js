import mongoose from "mongoose";

const tierSchema = new mongoose.Schema({
  limit: {
    type: Number,
    min: 0,
    description: "Giới hạn kWh/m³ của bậc (null = không giới hạn)"
  },

  price: {
    type: Number,
    required: true,
    min: 0,
    description: "Giá của bậc (VNĐ/kWh hoặc VNĐ/m³)"
  },

  description: {
    type: String,
    trim: true,
    default: null
  }
}, { _id: false });

const utilityRateSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["electricity", "water"],
    required: true
  },

  name: {
    type: String,
    required: true,
    trim: true,
    description: "Tên bảng giá (ví dụ: 'Giá điện EVN 2026')"
  },

  effectiveFrom: {
    type: Date,
    required: true,
    description: "Ngày bắt đầu áp dụng"
  },

  effectiveTo: {
    type: Date,
    default: null,
    description: "Ngày kết thúc (null = đang áp dụng)"
  },

  isActive: {
    type: Boolean,
    default: true
  },

  // Điện - bậc thang
  tiers: {
    type: [tierSchema],
    default: null,
    description: "Các bậc giá (chỉ áp dụng cho điện)"
  },

  // Nước - đơn giá hoặc bậc thang
  unitPrice: {
    type: Number,
    default: null,
    min: 0,
    description: "Đơn giá (VNĐ/m³) - cho nước"
  },

  minCharge: {
    type: Number,
    default: 0,
    min: 0,
    description: "Phí tối thiểu"
  },

  vatRate: {
    type: Number,
    default: 0,
    min: 0,
    description: "Thuế VAT (%)"
  },

  notes: {
    type: String,
    trim: true,
    default: null
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  }

}, {
  timestamps: true,
  versionKey: false
});

utilityRateSchema.index({ type: 1, isActive: 1 });
utilityRateSchema.index({ effectiveFrom: -1 });

utilityRateSchema.methods.calculateElectricityCost = function(usage) {
  if (!this.tiers || this.tiers.length === 0) {
    return usage * (this.unitPrice || 0);
  }

  let totalCost = 0;
  let remainingUsage = usage;
  let previousLimit = 0;

  for (const tier of this.tiers) {
    if (remainingUsage <= 0) break;

    let tierUsage;
    if (tier.limit) {
      tierUsage = Math.min(remainingUsage, tier.limit - previousLimit);
    } else {
      tierUsage = remainingUsage;
    }

    totalCost += tierUsage * tier.price;
    remainingUsage -= tierUsage;
    previousLimit = tier.limit || previousLimit;
  }

  const vat = totalCost * (this.vatRate / 100);
  const finalCost = Math.max(this.minCharge, totalCost + vat);

  return Math.round(finalCost);
};

utilityRateSchema.methods.calculateWaterCost = function(usage) {
  let totalCost = usage * (this.unitPrice || 0);
  const vat = totalCost * (this.vatRate / 100);
  const finalCost = Math.max(this.minCharge, totalCost + vat);

  return Math.round(finalCost);
};

utilityRateSchema.methods.getTierBreakdown = function(usage) {
  if (!this.tiers || this.type !== "electricity") {
    return [{
      tier: 1,
      usage: usage,
      unitPrice: this.unitPrice,
      amount: this.calculateWaterCost(usage)
    }];
  }

  const breakdown = [];
  let remainingUsage = usage;
  let previousLimit = 0;
  let tierIndex = 1;

  for (const tier of this.tiers) {
    if (remainingUsage <= 0) break;

    let tierUsage;
    if (tier.limit) {
      tierUsage = Math.min(remainingUsage, tier.limit - previousLimit);
    } else {
      tierUsage = remainingUsage;
    }

    breakdown.push({
      tier: tierIndex,
      usage: tierUsage,
      unitPrice: tier.price,
      amount: Math.round(tierUsage * tier.price)
    });

    remainingUsage -= tierUsage;
    previousLimit = tier.limit || previousLimit;
    tierIndex++;
  }

  return breakdown;
};

utilityRateSchema.statics.getActiveRate = async function(type) {
  const now = new Date();
  return this.findOne({
    type,
    isActive: true,
    effectiveFrom: { $lte: now },
    $or: [
      { effectiveTo: null },
      { effectiveTo: { $gte: now } }
    ]
  }).sort({ effectiveFrom: -1 });
};

utilityRateSchema.statics.getElectricityRate = async function() {
  return this.getActiveRate("electricity");
};

utilityRateSchema.statics.getWaterRate = async function() {
  return this.getActiveRate("water");
};

utilityRateSchema.statics.createDefaultRates = async function(adminId) {
  const defaultElectricity = {
    type: "electricity",
    name: "Giá điện EVN sinh hoạt 2026",
    effectiveFrom: new Date("2026-01-01"),
    tiers: [
      { limit: 50, price: 1806, description: "Bậc 1: 0-50 kWh" },
      { limit: 100, price: 1866, description: "Bậc 2: 51-100 kWh" },
      { limit: 200, price: 2271, description: "Bậc 3: 101-200 kWh" },
      { limit: 300, price: 2920, description: "Bậc 4: 201-300 kWh" },
      { limit: 400, price: 3015, description: "Bậc 5: 301-400 kWh" },
      { price: 3151, description: "Bậc 6: >400 kWh" }
    ],
    vatRate: 10,
    createdBy: adminId
  };

  const defaultWater = {
    type: "water",
    name: "Giá nước sinh hoạt KTX 2026",
    effectiveFrom: new Date("2026-01-01"),
    unitPrice: 12000,
    minCharge: 10000,
    vatRate: 5,
    createdBy: adminId
  };

  const elecExists = await this.findOne({ type: "electricity", isActive: true });
  const waterExists = await this.findOne({ type: "water", isActive: true });

  const results = {
    electricity: null,
    water: null
  };

  if (!elecExists) {
    results.electricity = await this.create(defaultElectricity);
  }

  if (!waterExists) {
    results.water = await this.create(defaultWater);
  }

  return results;
};

export default mongoose.model("UtilityRate", utilityRateSchema);
