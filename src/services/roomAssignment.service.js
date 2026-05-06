import Room from "../models/building/room.model.js";
import Building from "../models/building/building.model.js";
import Student from "../models/user/student.model.js";
import User from "../models/user/user.model.js";
import RoomAssignment from "../models/building/roomAssignment.model.js";
import mongoose from "mongoose";

class RoomAssignmentService {

  /**
   * Tìm phòng phù hợp nhất cho sinh viên
   * @param {Object} criteria - Tiêu chí tìm phòng
   * @param {string} criteria.studentId - ID sinh viên
   * @param {string} [criteria.preferredBuildingId] - ID tòa nhà ưu tiên
   * @param {number} [criteria.preferredFloor] - Tầng ưu tiên
   * @param {string} [criteria.roomType] - Loại phòng ưu tiên
   * @param {string[]} [criteria.preferredRoommateIds] - ID bạn cùng phòng mong muốn
   * @param {boolean} [criteria.allowMixedBuilding] - Cho phép phòng mixed gender
   * @returns {Promise<Object>} - Phòng phù hợp nhất
   */
  async findBestRoom(criteria) {
    const {
      studentId,
      preferredBuildingId,
      preferredFloor,
      roomType,
      preferredRoommateIds,
      allowMixedBuilding = false
    } = criteria;

    const student = await Student.findById(studentId).populate("userId", "gender");
    if (!student) {
      throw new Error("Student not found");
    }

    const studentGender = student.userId?.gender || "other";

    if (student.currentRoom) {
      throw new Error("Student already has an assigned room");
    }

    let buildingFilter = { status: "active" };
    if (preferredBuildingId) {
      buildingFilter._id = preferredBuildingId;
    }

    const buildings = await Building.find(buildingFilter);
    if (!buildings.length) {
      throw new Error("No available buildings found");
    }

    let suitableBuildings = buildings.filter(b => {
      if (b.buildingType === "mixed" && allowMixedBuilding) return true;
      return b.buildingType === studentGender || b.buildingType === "mixed";
    });

    if (suitableBuildings.length === 0) {
      throw new Error(`No suitable buildings found for ${studentGender} student`);
    }

    const buildingIds = suitableBuildings.map(b => b._id.toString());

    let roomFilter = {
      buildingId: { $in: buildingIds },
      roomStatus: { $in: ["available", "reserved"] },
      $expr: { $lt: ["$currentOccupancy", "$capacity"] }
    };

    if (roomType) {
      roomFilter.roomType = roomType;
    }

    if (studentGender !== "other") {
      roomFilter.gender = studentGender;
    }

    if (preferredFloor !== undefined) {
      roomFilter.floor = preferredFloor;
    }

    const availableRooms = await Room.find(roomFilter)
      .populate("buildingId", "buildingCode buildingName buildingType totalFloors")
      .populate({
        path: "assignedStudents.studentId",
        select: "studentId userId",
        populate: {
          path: "userId",
          select: "fullName gender"
        }
      })
      .sort({ currentOccupancy: -1, floor: 1, roomNumber: 1 });

    if (!availableRooms.length) {
      throw new Error("No available rooms matching criteria");
    }

    let scoredRooms = availableRooms.map(room => {
      let score = 0;
      let reasons = [];

      const availableSlots = room.capacity - room.currentOccupancy;
      score += availableSlots * 10;

      if (room.currentOccupancy > 0) {
        score += 20;
        reasons.push("Phòng đã có người ở - tạo cộng đồng");
      } else {
        score += 5;
        reasons.push("Phòng trống hoàn toàn - riêng tư");
      }

      if (preferredFloor !== undefined && room.floor === preferredFloor) {
        score += 50;
        reasons.push(`Đúng tầng ${preferredFloor} mong muốn`);
      } else if (preferredFloor !== undefined) {
        const floorDiff = Math.abs(room.floor - preferredFloor);
        score += Math.max(0, 30 - floorDiff * 5);
        reasons.push(`Gần tầng ${preferredFloor} (cách ${floorDiff} tầng)`);
      }

      if (preferredBuildingId && room.buildingId._id.toString() === preferredBuildingId) {
        score += 40;
        reasons.push("Đúng tòa nhà mong muốn");
      }

      if (roomType && room.roomType === roomType) {
        score += 30;
        reasons.push(`Đúng loại phòng ${roomType}`);
      }

      if (preferredRoommateIds && preferredRoommateIds.length > 0 && room.assignedStudents.length > 0) {
        const roomStudentIds = room.assignedStudents.map(s => s.studentId._id.toString());
        const matchingRoommates = preferredRoommateIds.filter(id =>
          roomStudentIds.includes(id)
        ).length;

        if (matchingRoommates > 0) {
          score += matchingRoommates * 100;
          reasons.push(`Có ${matchingRoommates} bạn cùng phòng mong muốn`);
        }
      }

      if (room.buildingId.buildingType === studentGender) {
        score += 15;
        reasons.push(`Tòa nhà ${studentGender} - phù hợp giới tính`);
      }

      return {
        room,
        score,
        reasons,
        availableSlots,
        matchPercentage: Math.min(100, Math.round((score / 200) * 100))
      };
    });

    scoredRooms.sort((a, b) => b.score - a.score);

    return {
      bestMatch: scoredRooms[0],
      allOptions: scoredRooms.slice(0, 5),
      totalAvailable: scoredRooms.length
    };
  }

  /**
   * Phân phòng tự động cho nhiều sinh viên
   * @param {Array<string>} studentIds - Danh sách ID sinh viên
   * @param {Object} options - Tùy chọn phân phòng
   * @returns {Promise<Object>} - Kết quả phân phòng
   */
  async autoAssignMultipleStudents(studentIds, options = {}) {
    const {
      preferredBuildingId,
      roomType,
      assignByFloor = false,
      respectPreferences = true,
      assignedBy
    } = options;

    const results = {
      success: [],
      failed: [],
      skipped: []
    };

    const studentQueue = [...studentIds];

    if (assignByFloor && preferredBuildingId) {
      studentQueue.sort(async (a, b) => {
        const studentA = await Student.findById(a).populate("userId", "fullName");
        const studentB = await Student.findById(b).populate("userId", "fullName");
        return studentA.userId?.fullName?.localeCompare(studentB.userId?.fullName) || 0;
      });
    }

    const usedRooms = new Map();

    for (const studentId of studentQueue) {
      try {
        const student = await Student.findById(studentId).populate("userId", "gender fullName");

        if (!student) {
          results.failed.push({
            studentId,
            reason: "Student not found"
          });
          continue;
        }

        if (student.currentRoom) {
          results.skipped.push({
            studentId,
            studentName: student.userId?.fullName,
            reason: "Already has a room",
            currentRoom: student.currentRoom
          });
          continue;
        }

        let preferences = {};
        if (respectPreferences) {
          preferences = await this.getStudentPreferences(studentId);
        }

        const criteria = {
          studentId,
          preferredBuildingId: preferences.preferredBuilding || preferredBuildingId,
          preferredFloor: preferences.preferredFloor,
          roomType: preferences.preferredRoomType || roomType,
          preferredRoommateIds: preferences.preferredRoommates,
          allowMixedBuilding: preferences.allowMixedBuilding
        };

        const { bestMatch } = await this.findBestRoom(criteria);

        const roomId = bestMatch.room._id;

        if (usedRooms.has(roomId.toString())) {
          const currentCount = usedRooms.get(roomId.toString());
          const roomCapacity = bestMatch.room.capacity;

          if (currentCount >= roomCapacity) {
            const { bestMatch: alternativeMatch } = await this.findBestRoom({
              ...criteria,
              excludeRoomIds: Array.from(usedRooms.keys())
            });

            if (alternativeMatch) {
              await this.executeAssignment(studentId, alternativeMatch.room._id, assignedBy, "auto");
              results.success.push({
                studentId,
                studentName: student.userId?.fullName,
                roomId: alternativeMatch.room._id,
                roomCode: alternativeMatch.room.roomCode,
                buildingName: alternativeMatch.room.buildingId.buildingName,
                assignmentType: "auto_alternative",
                reasons: alternativeMatch.reasons,
                matchPercentage: alternativeMatch.matchPercentage
              });

              const newCount = usedRooms.get(alternativeMatch.room._id.toString()) || 0;
              usedRooms.set(alternativeMatch.room._id.toString(), newCount + 1);
              continue;
            }
          }
        }

        await this.executeAssignment(studentId, roomId, assignedBy, "auto");

        results.success.push({
          studentId,
          studentName: student.userId?.fullName,
          roomId,
          roomCode: bestMatch.room.roomCode,
          buildingName: bestMatch.room.buildingId.buildingName,
          floor: bestMatch.room.floor,
          assignmentType: "auto",
          reasons: bestMatch.reasons,
          matchPercentage: bestMatch.matchPercentage
        });

        const currentCount = usedRooms.get(roomId.toString()) || 0;
        usedRooms.set(roomId.toString(), currentCount + 1);

      } catch (error) {
        results.failed.push({
          studentId,
          reason: error.message
        });
      }
    }

    return results;
  }

  /**
   * Thực hiện phân phòng
   * @param {string} studentId - ID sinh viên
   * @param {string} roomId - ID phòng
   * @param {string} assignedBy - ID người phân phòng
   * @param {string} assignmentType - Loại phân phòng
   * @returns {Promise<Object>} - Assignment đã tạo
   */
  async executeAssignment(studentId, roomId, assignedBy, assignmentType = "new") {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const student = await Student.findById(studentId).session(session);
      const room = await Room.findById(roomId).populate("buildingId").session(session);

      if (!student || !room) {
        throw new Error("Student or room not found");
      }

      if (student.currentRoom) {
        throw new Error("Student already has an assigned room");
      }

      if (room.currentOccupancy >= room.capacity) {
        throw new Error("Room is full");
      }

      const assignment = new RoomAssignment({
        studentId,
        roomId,
        buildingId: room.buildingId._id,
        assignmentType,
        assignedBy,
        assignedAt: new Date(),
        checkInDate: new Date(),
        status: "active"
      });

      await assignment.save({ session });

      room.assignedStudents.push({
        studentId,
        assignedAt: new Date()
      });
      room.currentOccupancy += 1;

      if (room.currentOccupancy >= room.capacity) {
        room.roomStatus = "full";
      } else if (room.currentOccupancy > 0) {
        room.roomStatus = "reserved";
      }

      await room.save({ session });

      student.currentRoom = roomId;
      student.ktxStatus = "checked_in";
      await student.save({ session });

      await Building.findByIdAndUpdate(
        room.buildingId._id,
        {
          $inc: {
            "stats.currentOccupancy": 1,
            "stats.availableRooms": room.currentOccupancy === 1 ? -1 : 0,
            "stats.occupiedRooms": room.currentOccupancy >= room.capacity ? 1 : 0
          }
        },
        { session }
      );

      await session.commitTransaction();

      return assignment;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Lấy thông tin ưu tiên của sinh viên
   * @param {string} studentId - ID sinh viên
   * @returns {Promise<Object>} - Thông tin ưu tiên
   */
  async getStudentPreferences(studentId) {
    const student = await Student.findById(studentId);

    if (!student) {
      return {};
    }

    return {
      preferredBuilding: student.preferences?.building,
      preferredFloor: student.preferences?.floor,
      preferredRoomType: student.preferences?.roomType,
      preferredRoommates: student.preferences?.roommates,
      allowMixedBuilding: student.preferences?.allowMixedBuilding || false,
      specialRequirements: student.preferences?.specialRequirements || []
    };
  }

  /**
   * Tìm phòng cho nhóm sinh viên muốn ở cùng nhau
   * @param {Array<string>} studentIds - Danh sách ID sinh viên
   * @param {Object} options - Tùy chọn
   * @returns {Promise<Object>} - Kết quả tìm phòng
   */
  async findRoomForGroup(studentIds, options = {}) {
    if (!studentIds || studentIds.length === 0) {
      throw new Error("No students provided");
    }

    if (studentIds.length > 8) {
      throw new Error("Group size cannot exceed 8 students");
    }

    const students = await Student.find({
      _id: { $in: studentIds }
    }).populate("userId", "gender");

    if (students.length !== studentIds.length) {
      const foundIds = students.map(s => s._id.toString());
      const missingIds = studentIds.filter(id => !foundIds.includes(id));
      throw new Error(`Students not found: ${missingIds.join(", ")}`);
    }

    const genders = [...new Set(students.map(s => s.userId?.gender).filter(Boolean))];

    if (genders.length > 1 && !options.allowMixedGender) {
      throw new Error("Group contains mixed genders. Set allowMixedGender to true or split the group.");
    }

    const groupGender = genders.length === 1 ? genders[0] : "mixed";

    const occupiedStudents = students.filter(s => s.currentRoom);
    if (occupiedStudents.length > 0) {
      throw new Error(`Some students already have rooms: ${occupiedStudents.map(s => s._id).join(", ")}`);
    }

    const roomFilter = {
      roomStatus: { $in: ["available", "reserved"] },
      $expr: { $gte: [{ $subtract: ["$capacity", "$currentOccupancy"] }, studentIds.length] }
    };

    if (groupGender !== "mixed") {
      roomFilter.gender = groupGender;
    }

    if (options.preferredBuildingId) {
      roomFilter.buildingId = options.preferredBuildingId;
    }

    if (options.roomType) {
      roomFilter.roomType = options.roomType;
    }

    const suitableRooms = await Room.find(roomFilter)
      .populate("buildingId", "buildingCode buildingName")
      .sort({ capacity: 1, currentOccupancy: -1 });

    if (!suitableRooms.length) {
      throw new Error(`No room found that can accommodate ${studentIds.length} students together`);
    }

    return {
      groupSize: studentIds.length,
      groupGender,
      suitableRooms: suitableRooms.map(room => ({
        roomId: room._id,
        roomCode: room.roomCode,
        buildingName: room.buildingId.buildingName,
        capacity: room.capacity,
        currentOccupancy: room.currentOccupancy,
        availableSlots: room.capacity - room.currentOccupancy,
        floor: room.floor,
        roomType: room.roomType
      })),
      recommendedRoom: suitableRooms[0]
    };
  }

  /**
   * Phân phòng cho nhóm sinh viên
   * @param {Array<string>} studentIds - Danh sách ID sinh viên
   * @param {string} roomId - ID phòng
   * @param {string} assignedBy - ID người phân phòng
   * @returns {Promise<Object>} - Kết quả phân phòng
   */
  async assignGroupToRoom(studentIds, roomId, assignedBy) {
    const room = await Room.findById(roomId);

    if (!room) {
      throw new Error("Room not found");
    }

    const availableSlots = room.capacity - room.currentOccupancy;

    if (availableSlots < studentIds.length) {
      throw new Error(`Room only has ${availableSlots} slots available for ${studentIds.length} students`);
    }

    const results = {
      success: [],
      failed: []
    };

    for (const studentId of studentIds) {
      try {
        await this.executeAssignment(studentId, roomId, assignedBy, "group");
        results.success.push(studentId);
      } catch (error) {
        results.failed.push({ studentId, reason: error.message });
      }
    }

    return {
      roomId,
      roomCode: room.roomCode,
      assigned: results.success.length,
      failed: results.failed,
      studentIds: results.success
    };
  }

  /**
   * Gợi ý phòng cho sinh viên
   * @param {string} studentId - ID sinh viên
   * @param {Object} options - Tùy chọn
   * @returns {Promise<Object>} - Danh sách gợi ý
   */
  async suggestRooms(studentId, options = {}) {
    const { limit = 5, includeReasons = true } = options;

    const criteria = {
      studentId,
      ...options
    };

    const { allOptions } = await this.findBestRoom(criteria);

    return {
      studentId,
      suggestions: allOptions.slice(0, limit).map(option => ({
        roomId: option.room._id,
        roomCode: option.room.roomCode,
        roomNumber: option.room.roomNumber,
        floor: option.room.floor,
        buildingName: option.room.buildingId.buildingName,
        roomType: option.room.roomType,
        capacity: option.room.capacity,
        currentOccupancy: option.room.currentOccupancy,
        availableSlots: option.availableSlots,
        pricePerMonth: option.room.pricePerMonth,
        matchScore: option.score,
        matchPercentage: option.matchPercentage,
        reasons: includeReasons ? option.reasons : undefined
      }))
    };
  }

  /**
   * Báo cáo tình trạng phòng trống
   * @returns {Promise<Object>} - Báo cáo
   */
  async getRoomAvailabilityReport() {
    // Lấy chi tiết từng phòng trống
    const availableRooms = await Room.find({
      roomStatus: { $in: ["available", "reserved"] },
      $expr: { $lt: ["$currentOccupancy", "$capacity"] }
    })
      .populate("buildingId", "buildingCode buildingName buildingType")
      .sort({ buildingId: 1, floor: 1, roomNumber: 1 });

    // Thêm trường availableSlots cho mỗi phòng
    const details = availableRooms.map(room => ({
      ...room.toObject(),
      availableSlots: room.capacity - room.currentOccupancy,
      buildingName: room.buildingId?.buildingName || 'N/A'
    }));

    // Tính thống kê tổng
    const summary = await Room.aggregate([
      {
        $group: {
          _id: null,
          totalRooms: { $sum: 1 },
          totalCapacity: { $sum: "$capacity" },
          totalOccupancy: { $sum: "$currentOccupancy" },
          availableRooms: {
            $sum: { $cond: [{ $eq: ["$roomStatus", "available"] }, 1, 0] }
          },
          fullRooms: {
            $sum: { $cond: [{ $eq: ["$roomStatus", "full"] }, 1, 0] }
          },
          maintenanceRooms: {
            $sum: { $cond: [{ $eq: ["$roomStatus", "maintenance"] }, 1, 0] }
          },
          availableSlots: {
            $sum: { $subtract: ["$capacity", "$currentOccupancy"] }
          }
        }
      }
    ]);

    return {
      summary: summary[0] || {
        totalRooms: 0,
        totalCapacity: 0,
        totalOccupancy: 0,
        availableRooms: 0,
        fullRooms: 0,
        maintenanceRooms: 0,
        availableSlots: 0
      },
      details,
      generatedAt: new Date()
    };
  }
}

export default new RoomAssignmentService();
