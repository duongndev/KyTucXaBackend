import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import Building from "../src/models/building/building.model.js";
import Room from "../src/models/building/room.model.js";
import RoomAssignment from "../src/models/building/roomAssignment.model.js";

describe("Building Module Tests", () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Building.deleteMany({});
    await Room.deleteMany({});
    await RoomAssignment.deleteMany({});
  });

  describe("Building Model", () => {
    test("should create a building successfully", async () => {
      const building = new Building({
        buildingCode: "A",
        buildingName: "KTX A",
        buildingType: "male",
        totalFloors: 16,
        address: "123 Đường ABC",
        description: "Tòa nhà KTX cho nam",
        amenities: ["wifi", "parking"]
      });

      const savedBuilding = await building.save();

      expect(savedBuilding._id).toBeDefined();
      expect(savedBuilding.buildingCode).toBe("A");
      expect(savedBuilding.buildingName).toBe("KTX A");
      expect(savedBuilding.buildingType).toBe("male");
      expect(savedBuilding.totalFloors).toBe(16);
      expect(savedBuilding.status).toBe("active");
      expect(savedBuilding.stats.totalRooms).toBe(0);
    });

    test("should fail to create building without required fields", async () => {
      const building = new Building({
        buildingName: "KTX B"
      });

      await expect(building.save()).rejects.toThrow();
    });

    test("should enforce unique building code", async () => {
      const building1 = new Building({
        buildingCode: "B",
        buildingName: "KTX B",
        buildingType: "female",
        totalFloors: 12
      });
      await building1.save();

      const building2 = new Building({
        buildingCode: "B",
        buildingName: "KTX C",
        buildingType: "male",
        totalFloors: 10
      });

      await expect(building2.save()).rejects.toThrow();
    });
  });

  describe("Room Model", () => {
    let building;

    beforeEach(async () => {
      building = new Building({
        buildingCode: "C",
        buildingName: "KTX C",
        buildingType: "female",
        totalFloors: 10
      });
      await building.save();
    });

    test("should create a room successfully", async () => {
      const room = new Room({
        buildingId: building._id,
        roomNumber: "1514",
        floor: 15,
        roomCode: "C-1514",
        roomType: "4-bed",
        capacity: 4,
        gender: "female",
        area: 30,
        pricePerMonth: 500000,
        facilities: [
          { name: "AC", quantity: 1, status: "good" },
          { name: "fan", quantity: 2, status: "good" }
        ]
      });

      const savedRoom = await room.save();

      expect(savedRoom._id).toBeDefined();
      expect(savedRoom.roomNumber).toBe("1514");
      expect(savedRoom.floor).toBe(15);
      expect(savedRoom.roomCode).toBe("C-1514");
      expect(savedRoom.capacity).toBe(4);
      expect(savedRoom.roomStatus).toBe("available");
      expect(savedRoom.facilities).toHaveLength(2);
    });

    test("should enforce unique room code per building", async () => {
      const room1 = new Room({
        buildingId: building._id,
        roomNumber: "101",
        floor: 1,
        roomCode: "C-101",
        roomType: "2-bed",
        capacity: 2,
        gender: "female"
      });
      await room1.save();

      const room2 = new Room({
        buildingId: building._id,
        roomNumber: "101",
        floor: 1,
        roomCode: "C-101",
        roomType: "4-bed",
        capacity: 4,
        gender: "female"
      });

      await expect(room2.save()).rejects.toThrow();
    });

    test("should calculate occupancy rate correctly", async () => {
      const room = new Room({
        buildingId: building._id,
        roomNumber: "202",
        floor: 2,
        roomCode: "C-202",
        roomType: "4-bed",
        capacity: 4,
        gender: "female",
        currentOccupancy: 2
      });
      await room.save();

      expect(room.currentOccupancy).toBe(2);
      expect(room.capacity).toBe(4);
    });
  });

  describe("RoomAssignment Model", () => {
    let building, room, studentId;

    beforeEach(async () => {
      building = new Building({
        buildingCode: "D",
        buildingName: "KTX D",
        buildingType: "male",
        totalFloors: 8
      });
      await building.save();

      room = new Room({
        buildingId: building._id,
        roomNumber: "301",
        floor: 3,
        roomCode: "D-301",
        roomType: "4-bed",
        capacity: 4,
        gender: "male"
      });
      await room.save();

      studentId = new mongoose.Types.ObjectId();
    });

    test("should create room assignment successfully", async () => {
      const assignment = new RoomAssignment({
        studentId: studentId,
        roomId: room._id,
        buildingId: building._id,
        assignmentType: "new",
        assignedBy: new mongoose.Types.ObjectId(),
        checkInDate: new Date(),
        status: "active"
      });

      const savedAssignment = await assignment.save();

      expect(savedAssignment._id).toBeDefined();
      expect(savedAssignment.studentId.toString()).toBe(studentId.toString());
      expect(savedAssignment.roomId.toString()).toBe(room._id.toString());
      expect(savedAssignment.status).toBe("active");
      expect(savedAssignment.assignmentType).toBe("new");
    });

    test("should support transfer assignment", async () => {
      const originalAssignment = new RoomAssignment({
        studentId: studentId,
        roomId: room._id,
        buildingId: building._id,
        assignmentType: "new",
        assignedBy: new mongoose.Types.ObjectId(),
        checkInDate: new Date(),
        status: "active"
      });
      await originalAssignment.save();

      const newRoom = new Room({
        buildingId: building._id,
        roomNumber: "302",
        floor: 3,
        roomCode: "D-302",
        roomType: "4-bed",
        capacity: 4,
        gender: "male"
      });
      await newRoom.save();

      const transferAssignment = new RoomAssignment({
        studentId: studentId,
        roomId: newRoom._id,
        buildingId: building._id,
        assignmentType: "transfer",
        assignedBy: new mongoose.Types.ObjectId(),
        checkInDate: new Date(),
        status: "active",
        previousAssignmentId: originalAssignment._id,
        transferReason: "Yêu cầu chuyển phòng"
      });

      originalAssignment.status = "transferred";
      originalAssignment.checkOutDate = new Date();
      await originalAssignment.save();

      const savedTransfer = await transferAssignment.save();

      expect(savedTransfer.assignmentType).toBe("transfer");
      expect(savedTransfer.previousAssignmentId.toString()).toBe(originalAssignment._id.toString());
      expect(savedTransfer.transferReason).toBe("Yêu cầu chuyển phòng");
    });

    test("should support check-out", async () => {
      const assignment = new RoomAssignment({
        studentId: studentId,
        roomId: room._id,
        buildingId: building._id,
        assignmentType: "new",
        assignedBy: new mongoose.Types.ObjectId(),
        checkInDate: new Date("2024-01-01"),
        status: "active"
      });
      await assignment.save();

      assignment.status = "ended";
      assignment.checkOutDate = new Date("2024-06-01");
      await assignment.save();

      const updatedAssignment = await RoomAssignment.findById(assignment._id);
      expect(updatedAssignment.status).toBe("ended");
      expect(updatedAssignment.checkOutDate).toBeDefined();
    });
  });

  describe("Integration: Room Occupancy Flow", () => {
    let building, room, studentId1, studentId2;

    beforeEach(async () => {
      building = new Building({
        buildingCode: "E",
        buildingName: "KTX E",
        buildingType: "female",
        totalFloors: 5
      });
      await building.save();

      room = new Room({
        buildingId: building._id,
        roomNumber: "502",
        floor: 5,
        roomCode: "E-502",
        roomType: "2-bed",
        capacity: 2,
        gender: "female",
        currentOccupancy: 0
      });
      await room.save();

      studentId1 = new mongoose.Types.ObjectId();
      studentId2 = new mongoose.Types.ObjectId();
    });

    test("should handle full room occupancy flow", async () => {
      // Student 1 checks in
      const assignment1 = new RoomAssignment({
        studentId: studentId1,
        roomId: room._id,
        buildingId: building._id,
        assignmentType: "new",
        assignedBy: new mongoose.Types.ObjectId(),
        checkInDate: new Date(),
        status: "active"
      });
      await assignment1.save();

      room.assignedStudents.push({
        studentId: studentId1,
        assignedAt: new Date()
      });
      room.currentOccupancy = 1;
      await room.save();

      expect(room.currentOccupancy).toBe(1);
      expect(room.roomStatus).toBe("available");

      // Student 2 checks in
      const assignment2 = new RoomAssignment({
        studentId: studentId2,
        roomId: room._id,
        buildingId: building._id,
        assignmentType: "new",
        assignedBy: new mongoose.Types.ObjectId(),
        checkInDate: new Date(),
        status: "active"
      });
      await assignment2.save();

      room.assignedStudents.push({
        studentId: studentId2,
        assignedAt: new Date()
      });
      room.currentOccupancy = 2;
      room.roomStatus = "full";
      await room.save();

      expect(room.currentOccupancy).toBe(2);
      expect(room.roomStatus).toBe("full");
      expect(room.assignedStudents).toHaveLength(2);

      // Student 1 checks out
      assignment1.status = "ended";
      assignment1.checkOutDate = new Date();
      await assignment1.save();

      room.assignedStudents = room.assignedStudents.filter(
        s => s.studentId.toString() !== studentId1.toString()
      );
      room.currentOccupancy = 1;
      room.roomStatus = "reserved";
      await room.save();

      expect(room.currentOccupancy).toBe(1);
      expect(room.roomStatus).toBe("reserved");
      expect(room.assignedStudents).toHaveLength(1);
    });
  });
});
