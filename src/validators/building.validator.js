import Joi from "joi";

// ObjectId validation helper
const objectIdSchema = Joi.string()
  .pattern(/^[0-9a-fA-F]{24}$/)
  .messages({
    "string.pattern.base": "ID không hợp lệ"
  });

// Building validation schemas
export const createBuildingSchema = Joi.object({
  buildingCode: Joi.string()
    .min(1)
    .max(10)
    .required()
    .uppercase()
    .messages({
      "string.min": "Mã tòa nhà phải có ít nhất 1 ký tự",
      "string.max": "Mã tòa nhà không quá 10 ký tự",
      "any.required": "Mã tòa nhà là bắt buộc"
    }),

  buildingName: Joi.string()
    .min(2)
    .max(100)
    .required()
    .messages({
      "string.min": "Tên tòa nhà phải ít nhất 2 ký tự",
      "string.max": "Tên tòa nhà không quá 100 ký tự",
      "any.required": "Tên tòa nhà là bắt buộc"
    }),

  buildingType: Joi.string()
    .valid("male", "female", "mixed")
    .required()
    .messages({
      "any.only": "Loại tòa nhà phải là male, female, hoặc mixed",
      "any.required": "Loại tòa nhà là bắt buộc"
    }),

  totalFloors: Joi.number()
    .integer()
    .min(1)
    .max(50)
    .required()
    .messages({
      "number.base": "Số tầng phải là số nguyên",
      "number.min": "Số tầng phải từ 1 trở lên",
      "number.max": "Số tầng không quá 50",
      "any.required": "Số tầng là bắt buộc"
    }),

  address: Joi.string()
    .max(200)
    .allow("")
    .optional()
    .messages({
      "string.max": "Địa chỉ không quá 200 ký tự"
    }),

  description: Joi.string()
    .max(500)
    .allow("")
    .optional()
    .messages({
      "string.max": "Mô tả không quá 500 ký tự"
    }),

  amenities: Joi.array()
    .items(Joi.string().max(50))
    .max(20)
    .optional()
    .messages({
      "array.max": "Tối đa 20 tiện ích"
    })
});

export const updateBuildingSchema = Joi.object({
  buildingName: Joi.string()
    .min(2)
    .max(100)
    .optional()
    .messages({
      "string.min": "Tên tòa nhà phải ít nhất 2 ký tự",
      "string.max": "Tên tòa nhà không quá 100 ký tự"
    }),

  buildingType: Joi.string()
    .valid("male", "female", "mixed")
    .optional()
    .messages({
      "any.only": "Loại tòa nhà phải là male, female, hoặc mixed"
    }),

  totalFloors: Joi.number()
    .integer()
    .min(1)
    .max(50)
    .optional()
    .messages({
      "number.base": "Số tầng phải là số nguyên",
      "number.min": "Số tầng phải từ 1 trở lên",
      "number.max": "Số tầng không quá 50"
    }),

  address: Joi.string()
    .max(200)
    .allow("")
    .optional()
    .messages({
      "string.max": "Địa chỉ không quá 200 ký tự"
    }),

  description: Joi.string()
    .max(500)
    .allow("")
    .optional()
    .messages({
      "string.max": "Mô tả không quá 500 ký tự"
    }),

  status: Joi.string()
    .valid("active", "inactive", "maintenance")
    .optional()
    .messages({
      "any.only": "Trạng thái phải là active, inactive, hoặc maintenance"
    }),

  amenities: Joi.array()
    .items(Joi.string().max(50))
    .max(20)
    .optional()
    .messages({
      "array.max": "Tối đa 20 tiện ích"
    })
});

// Room validation schemas
export const createRoomSchema = Joi.object({
  buildingId: objectIdSchema.required().messages({
    "any.required": "ID tòa nhà là bắt buộc"
  }),

  roomNumber: Joi.string()
    .min(3)
    .max(10)
    .required()
    .messages({
      "string.min": "Số phòng phải có ít nhất 3 ký tự (vd: 101)",
      "string.max": "Số phòng không quá 10 ký tự",
      "any.required": "Số phòng là bắt buộc"
    }),

  roomType: Joi.string()
    .valid("2-bed", "4-bed", "6-bed", "8-bed")
    .required()
    .messages({
      "any.only": "Loại phòng phải là 2-bed, 4-bed, 6-bed, hoặc 8-bed",
      "any.required": "Loại phòng là bắt buộc"
    }),

  capacity: Joi.number()
    .integer()
    .min(1)
    .max(20)
    .required()
    .messages({
      "number.base": "Sức chứa phải là số nguyên",
      "number.min": "Sức chứa phải từ 1 trở lên",
      "number.max": "Sức chứa không quá 20",
      "any.required": "Sức chứa là bắt buộc"
    }),

  gender: Joi.string()
    .valid("male", "female")
    .required()
    .messages({
      "any.only": "Giới tính phòng phải là male hoặc female",
      "any.required": "Giới tính phòng là bắt buộc"
    }),

  area: Joi.number()
    .min(0)
    .max(1000)
    .optional()
    .messages({
      "number.min": "Diện tích không thể âm",
      "number.max": "Diện tích không quá 1000 m²"
    }),

  pricePerMonth: Joi.number()
    .min(0)
    .max(10000000)
    .optional()
    .messages({
      "number.min": "Giá không thể âm",
      "number.max": "Giá không quá 10,000,000 VND"
    }),

  facilities: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().max(50).required(),
        quantity: Joi.number().integer().min(0).default(1),
        status: Joi.string().valid("good", "broken", "maintenance").default("good")
      })
    )
    .max(20)
    .optional()
    .messages({
      "array.max": "Tối đa 20 tiện nghi"
    }),

  notes: Joi.string()
    .max(500)
    .allow("")
    .optional()
    .messages({
      "string.max": "Ghi chú không quá 500 ký tự"
    })
});

export const updateRoomSchema = Joi.object({
  roomType: Joi.string()
    .valid("2-bed", "4-bed", "6-bed", "8-bed")
    .optional()
    .messages({
      "any.only": "Loại phòng phải là 2-bed, 4-bed, 6-bed, hoặc 8-bed"
    }),

  capacity: Joi.number()
    .integer()
    .min(1)
    .max(20)
    .optional()
    .messages({
      "number.base": "Sức chứa phải là số nguyên",
      "number.min": "Sức chứa phải từ 1 trở lên",
      "number.max": "Sức chứa không quá 20"
    }),

  area: Joi.number()
    .min(0)
    .max(1000)
    .optional()
    .messages({
      "number.min": "Diện tích không thể âm",
      "number.max": "Diện tích không quá 1000 m²"
    }),

  pricePerMonth: Joi.number()
    .min(0)
    .max(10000000)
    .optional()
    .messages({
      "number.min": "Giá không thể âm",
      "number.max": "Giá không quá 10,000,000 VND"
    }),

  roomStatus: Joi.string()
    .valid("available", "full", "maintenance", "reserved")
    .optional()
    .messages({
      "any.only": "Trạng thái phòng phải là available, full, maintenance, hoặc reserved"
    }),

  facilities: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().max(50).required(),
        quantity: Joi.number().integer().min(0).default(1),
        status: Joi.string().valid("good", "broken", "maintenance").default("good")
      })
    )
    .max(20)
    .optional()
    .messages({
      "array.max": "Tối đa 20 tiện nghi"
    }),

  notes: Joi.string()
    .max(500)
    .allow("")
    .optional()
    .messages({
      "string.max": "Ghi chú không quá 500 ký tự"
    })
});

export const bulkCreateRoomsSchema = Joi.object({
  buildingId: objectIdSchema.required().messages({
    "any.required": "ID tòa nhà là bắt buộc"
  }),

  rooms: Joi.array()
    .items(
      Joi.object({
        roomNumber: Joi.string().min(3).max(10).required(),
        roomType: Joi.string().valid("2-bed", "4-bed", "6-bed", "8-bed").required(),
        capacity: Joi.number().integer().min(1).max(20).required(),
        gender: Joi.string().valid("male", "female").required(),
        area: Joi.number().min(0).max(1000).optional(),
        pricePerMonth: Joi.number().min(0).max(10000000).optional(),
        facilities: Joi.array()
          .items(
            Joi.object({
              name: Joi.string().max(50).required(),
              quantity: Joi.number().integer().min(0).default(1),
              status: Joi.string().valid("good", "broken", "maintenance").default("good")
            })
          )
          .max(20)
          .optional()
      })
    )
    .min(1)
    .max(100)
    .required()
    .messages({
      "array.min": "Phải có ít nhất 1 phòng",
      "array.max": "Tối đa 100 phòng mỗi lần tạo",
      "any.required": "Danh sách phòng là bắt buộc"
    })
});

export const autoGenerateRoomsSchema = Joi.object({
  buildingId: objectIdSchema.required().messages({
    "any.required": "ID tòa nhà là bắt buộc"
  }),

  startFloor: Joi.number().integer().min(1).max(50).default(1).optional().messages({
    "number.min": "Tầng bắt đầu phải từ 1",
    "number.max": "Tầng không quá 50"
  }),

  endFloor: Joi.number().integer().min(1).max(50).required().messages({
    "any.required": "Tầng kết thúc là bắt buộc",
    "number.min": "Tầng phải từ 1",
    "number.max": "Tầng không quá 50"
  }),

  roomsPerFloor: Joi.number().integer().min(1).max(100).required().messages({
    "any.required": "Số phòng mỗi tầng là bắt buộc",
    "number.min": "Phải có ít nhất 1 phòng",
    "number.max": "Tối đa 100 phòng mỗi tầng"
  }),

  roomType: Joi.string().valid("2-bed", "4-bed", "6-bed", "8-bed").required().messages({
    "any.required": "Loại phòng là bắt buộc",
    "any.only": "Loại phòng phải là 2-bed, 4-bed, 6-bed, hoặc 8-bed"
  }),

  capacity: Joi.number().integer().min(1).max(20).required().messages({
    "any.required": "Sức chứa là bắt buộc",
    "number.min": "Sức chứa từ 1 người",
    "number.max": "Sức chứa tối đa 20 người"
  }),

  gender: Joi.string().valid("male", "female").optional().messages({
    "any.only": "Giới tính phải là male hoặc female (bắt buộc với tòa mixed)"
  }),

  area: Joi.number().min(0).max(1000).default(25).optional(),

  pricePerMonth: Joi.number().min(0).max(10000000).default(500000).optional(),

  facilities: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().max(50).required(),
        quantity: Joi.number().integer().min(0).default(1),
        status: Joi.string().valid("good", "broken", "maintenance").default("good")
      })
    )
    .max(20)
    .optional(),

  notes: Joi.string().max(500).allow("").optional()
});

export const updateRoomStatusSchema = Joi.object({
  roomStatus: Joi.string()
    .valid("available", "full", "maintenance", "reserved")
    .required()
    .messages({
      "any.only": "Trạng thái phòng phải là available, full, maintenance, hoặc reserved",
      "any.required": "Trạng thái phòng là bắt buộc"
    })
});

// Room Assignment validation schemas
export const assignStudentSchema = Joi.object({
  studentId: objectIdSchema.required().messages({
    "any.required": "ID sinh viên là bắt buộc"
  }),

  roomId: objectIdSchema.required().messages({
    "any.required": "ID phòng là bắt buộc"
  }),

  contractId: objectIdSchema.optional(),

  assignmentType: Joi.string()
    .valid("new", "transfer", "return")
    .default("new")
    .optional(),

  notes: Joi.string()
    .max(500)
    .allow("")
    .optional()
    .messages({
      "string.max": "Ghi chú không quá 500 ký tự"
    })
});

export const transferStudentSchema = Joi.object({
  assignmentId: objectIdSchema.required().messages({
    "any.required": "ID phân phòng hiện tại là bắt buộc"
  }),

  newRoomId: objectIdSchema.required().messages({
    "any.required": "ID phòng mới là bắt buộc"
  }),

  transferReason: Joi.string()
    .max(200)
    .allow("")
    .optional()
    .messages({
      "string.max": "Lý do chuyển phòng không quá 200 ký tự"
    }),

  notes: Joi.string()
    .max(500)
    .allow("")
    .optional()
    .messages({
      "string.max": "Ghi chú không quá 500 ký tự"
    })
});

export const checkOutSchema = Joi.object({
  assignmentId: objectIdSchema.required().messages({
    "any.required": "ID phân phòng là bắt buộc"
  }),

  checkOutDate: Joi.date().optional()
});

// Query validation schemas
export const buildingQuerySchema = Joi.object({
  status: Joi.string().valid("active", "inactive", "maintenance").optional(),
  buildingType: Joi.string().valid("male", "female", "mixed").optional(),
  page: Joi.number().integer().min(1).default(1).optional(),
  limit: Joi.number().integer().min(1).max(100).default(10).optional()
});

export const roomQuerySchema = Joi.object({
  buildingId: objectIdSchema.optional(),
  floor: Joi.number().integer().min(0).optional(),
  roomStatus: Joi.string().valid("available", "full", "maintenance", "reserved").optional(),
  gender: Joi.string().valid("male", "female").optional(),
  roomType: Joi.string().valid("2-bed", "4-bed", "6-bed", "8-bed").optional(),
  page: Joi.number().integer().min(1).default(1).optional(),
  limit: Joi.number().integer().min(1).max(100).default(20).optional(),
  sortBy: Joi.string().valid("roomCode", "floor", "roomStatus", "createdAt").default("roomCode").optional(),
  order: Joi.string().valid("asc", "desc").default("asc").optional()
});

export const assignmentQuerySchema = Joi.object({
  studentId: objectIdSchema.optional(),
  roomId: objectIdSchema.optional(),
  buildingId: objectIdSchema.optional(),
  status: Joi.string().valid("active", "ended", "transferred").optional(),
  assignmentType: Joi.string().valid("new", "transfer", "return").optional(),
  page: Joi.number().integer().min(1).default(1).optional(),
  limit: Joi.number().integer().min(1).max(100).default(20).optional(),
  sortBy: Joi.string().valid("assignedAt", "checkInDate", "checkOutDate").default("assignedAt").optional(),
  order: Joi.string().valid("asc", "desc").default("desc").optional()
});

// Auto Assignment validation schemas
export const findBestRoomSchema = Joi.object({
  studentId: objectIdSchema.required().messages({
    "any.required": "ID sinh viên là bắt buộc"
  }),
  preferredBuildingId: objectIdSchema.optional(),
  preferredFloor: Joi.number().integer().min(0).max(50).optional().messages({
    "number.min": "Tầng phải từ 0 trở lên",
    "number.max": "Tầng không quá 50"
  }),
  roomType: Joi.string().valid("2-bed", "4-bed", "6-bed", "8-bed").optional(),
  preferredRoommateIds: Joi.array().items(objectIdSchema).max(7).optional().messages({
    "array.max": "Tối đa 7 bạn cùng phòng mong muốn"
  }),
  allowMixedBuilding: Joi.boolean().default(false).optional()
});

export const autoAssignSchema = Joi.object({
  studentId: objectIdSchema.required().messages({
    "any.required": "ID sinh viên là bắt buộc"
  }),
  preferredBuildingId: objectIdSchema.optional(),
  preferredFloor: Joi.number().integer().min(0).max(50).optional(),
  roomType: Joi.string().valid("2-bed", "4-bed", "6-bed", "8-bed").optional(),
  notes: Joi.string().max(500).allow("").optional().messages({
    "string.max": "Ghi chú không quá 500 ký tự"
  })
});

export const autoAssignMultipleSchema = Joi.object({
  studentIds: Joi.array()
    .items(objectIdSchema)
    .min(1)
    .max(100)
    .required()
    .messages({
      "array.min": "Phải có ít nhất 1 sinh viên",
      "array.max": "Tối đa 100 sinh viên mỗi lần phân phòng",
      "any.required": "Danh sách sinh viên là bắt buộc"
    }),
  preferredBuildingId: objectIdSchema.optional(),
  roomType: Joi.string().valid("2-bed", "4-bed", "6-bed", "8-bed").optional(),
  assignByFloor: Joi.boolean().default(false).optional(),
  respectPreferences: Joi.boolean().default(true).optional()
});

export const groupRoomSchema = Joi.object({
  studentIds: Joi.array()
    .items(objectIdSchema)
    .min(1)
    .max(8)
    .required()
    .messages({
      "array.min": "Phải có ít nhất 1 sinh viên",
      "array.max": "Nhóm không quá 8 sinh viên",
      "any.required": "Danh sách sinh viên là bắt buộc"
    }),
  preferredBuildingId: objectIdSchema.optional(),
  roomType: Joi.string().valid("2-bed", "4-bed", "6-bed", "8-bed").optional(),
  allowMixedGender: Joi.boolean().default(false).optional()
});

export const assignGroupSchema = Joi.object({
  studentIds: Joi.array()
    .items(objectIdSchema)
    .min(1)
    .max(8)
    .required()
    .messages({
      "array.min": "Phải có ít nhất 1 sinh viên",
      "array.max": "Nhóm không quá 8 sinh viên",
      "any.required": "Danh sách sinh viên là bắt buộc"
    }),
  roomId: objectIdSchema.required().messages({
    "any.required": "ID phòng là bắt buộc"
  })
});

// Validation middleware
export const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, { abortEarly: false });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message
      }));

      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors
      });
    }

    next();
  };
};

export const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, { abortEarly: false });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message
      }));

      return res.status(400).json({
        success: false,
        message: "Query validation failed",
        errors
      });
    }

    req.query = value;
    next();
  };
};
