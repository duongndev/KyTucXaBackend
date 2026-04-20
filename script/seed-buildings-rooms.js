import mongoose from "mongoose";
import dotenv from "dotenv";
import Building from "../src/models/building/building.model.js";
import Room from "../src/models/building/room.model.js";
import { connectDB } from '../src/config/db.config.js';

dotenv.config();



const BUILDING_CONFIGS = [
  {
    buildingCode: "KTX-A",
    buildingName: "Ký túc xá A",
    buildingType: "male",
    totalFloors: 5,
    address: "Khu A - Đại học Bách Khoa",
    description: "Tòa nhà ký túc xá dành cho nam sinh viên",
    amenities: ["wifi", "parking", "laundry", "cafeteria"],
    roomsPerFloor: 20,
    roomType: "4-bed",
    capacity: 4,
    area: 25,
    pricePerMonth: 500000,
    facilities: [
      { name: "Giường tầng", quantity: 4, status: "good" },
      { name: "Bàn học", quantity: 4, status: "good" },
      { name: "Tủ quần áo", quantity: 4, status: "good" },
      { name: "Điều hòa", quantity: 1, status: "good" },
      { name: "Quạt trần", quantity: 1, status: "good" },
      { name: "Nóng lạnh", quantity: 1, status: "good" }
    ]
  },
  {
    buildingCode: "KTX-B",
    buildingName: "Ký túc xá B",
    buildingType: "female",
    totalFloors: 5,
    address: "Khu B - Đại học Bách Khoa",
    description: "Tòa nhà ký túc xá dành cho nữ sinh viên",
    amenities: ["wifi", "parking", "laundry", "cafeteria", "security"],
    roomsPerFloor: 20,
    roomType: "4-bed",
    capacity: 4,
    area: 25,
    pricePerMonth: 550000,
    facilities: [
      { name: "Giường tầng", quantity: 4, status: "good" },
      { name: "Bàn học", quantity: 4, status: "good" },
      { name: "Tủ quần áo", quantity: 4, status: "good" },
      { name: "Điều hòa", quantity: 1, status: "good" },
      { name: "Quạt trần", quantity: 1, status: "good" },
      { name: "Nóng lạnh", quantity: 1, status: "good" }
    ]
  },
  {
    buildingCode: "KTX-C",
    buildingName: "Ký túc xá C",
    buildingType: "male",
    totalFloors: 10,
    address: "Khu C - Đại học Bách Khoa",
    description: "Tòa nhà ký túc xá cao tầng dành cho nam sinh viên",
    amenities: ["wifi", "parking", "laundry", "cafeteria", "gym", "study_room"],
    roomsPerFloor: 30,
    roomType: "6-bed",
    capacity: 6,
    area: 35,
    pricePerMonth: 400000,
    facilities: [
      { name: "Giường tầng", quantity: 6, status: "good" },
      { name: "Bàn học", quantity: 6, status: "good" },
      { name: "Tủ quần áo", quantity: 6, status: "good" },
      { name: "Điều hòa", quantity: 2, status: "good" },
      { name: "Quạt trần", quantity: 2, status: "good" },
      { name: "Nóng lạnh", quantity: 1, status: "good" }
    ]
  },
  {
    buildingCode: "KTX-D",
    buildingName: "Ký túc xá D",
    buildingType: "female",
    totalFloors: 10,
    address: "Khu D - Đại học Bách Khoa",
    description: "Tòa nhà ký túc xá cao tầng dành cho nữ sinh viên",
    amenities: ["wifi", "parking", "laundry", "cafeteria", "gym", "study_room", "security"],
    roomsPerFloor: 30,
    roomType: "6-bed",
    capacity: 6,
    area: 35,
    pricePerMonth: 450000,
    facilities: [
      { name: "Giường tầng", quantity: 6, status: "good" },
      { name: "Bàn học", quantity: 6, status: "good" },
      { name: "Tủ quần áo", quantity: 6, status: "good" },
      { name: "Điều hòa", quantity: 2, status: "good" },
      { name: "Quạt trần", quantity: 2, status: "good" },
      { name: "Nóng lạnh", quantity: 1, status: "good" }
    ]
  },
  {
    buildingCode: "KTX-E",
    buildingName: "Ký túc xá E",
    buildingType: "male",
    totalFloors: 3,
    address: "Khu E - Đại học Bách Khoa",
    description: "Tòa nhà ký túc xá 2 người/phòng dành cho nam sinh viên",
    amenities: ["wifi", "parking", "laundry"],
    roomsPerFloor: 15,
    roomType: "2-bed",
    capacity: 2,
    area: 20,
    pricePerMonth: 800000,
    facilities: [
      { name: "Giường đơn", quantity: 2, status: "good" },
      { name: "Bàn học", quantity: 2, status: "good" },
      { name: "Tủ quần áo", quantity: 2, status: "good" },
      { name: "Điều hòa", quantity: 1, status: "good" },
      { name: "Nóng lạnh", quantity: 1, status: "good" }
    ]
  },
  {
    buildingCode: "KTX-F",
    buildingName: "Ký túc xá F",
    buildingType: "female",
    totalFloors: 3,
    address: "Khu F - Đại học Bách Khoa",
    description: "Tòa nhà ký túc xá 2 người/phòng dành cho nữ sinh viên",
    amenities: ["wifi", "parking", "laundry", "security"],
    roomsPerFloor: 15,
    roomType: "2-bed",
    capacity: 2,
    area: 20,
    pricePerMonth: 850000,
    facilities: [
      { name: "Giường đơn", quantity: 2, status: "good" },
      { name: "Bàn học", quantity: 2, status: "good" },
      { name: "Tủ quần áo", quantity: 2, status: "good" },
      { name: "Điều hòa", quantity: 1, status: "good" },
      { name: "Nóng lạnh", quantity: 1, status: "good" }
    ]
  }
];

function generateRoomCode(buildingCode, floor, roomNumber) {
  const floorStr = floor.toString().padStart(2, "0");
  const roomStr = roomNumber.toString().padStart(2, "0");
  return `${buildingCode}-${floorStr}${roomStr}`;
}

function generateRoomNumber(floor, roomIndex) {
  const floorPrefix = floor.toString();
  const roomSuffix = roomIndex.toString().padStart(2, "0");
  return `${floorPrefix}${roomSuffix}`;
}

async function seedBuildingsAndRooms() {
  try {
    console.log("Connecting to MongoDB...");
    await connectDB();
    console.log("Connected to MongoDB");

    console.log("\n========== XÓA DỮ LIỆU CŨ ==========");
    try {
      await Room.deleteMany({});
      console.log("✓ Đã xóa tất cả phòng");
      await Building.deleteMany({});
      console.log("✓ Đã xóa tất cả tòa nhà");
    } catch (err) {
      console.log("⚠ Không thể xóa dữ liệu cũ (thông báo):", err.message);
      console.log("   Tiếp tục tạo dữ liệu mới...");
    }

    console.log("\n========== TẠO TÒA NHÀ VÀ PHÒNG ==========");

    for (const config of BUILDING_CONFIGS) {
      console.log(`\n--- Tạo ${config.buildingName} (${config.buildingCode}) ---`);

      const building = new Building({
        buildingCode: config.buildingCode,
        buildingName: config.buildingName,
        buildingType: config.buildingType,
        totalFloors: config.totalFloors,
        address: config.address,
        description: config.description,
        status: "active",
        amenities: config.amenities,
        stats: {
          totalRooms: 0,
          availableRooms: 0,
          occupiedRooms: 0,
          totalCapacity: 0,
          currentOccupancy: 0
        }
      });

      await building.save();
      console.log(`✓ Tạo tòa nhà: ${config.buildingName}`);

      const rooms = [];
      let totalRooms = 0;
      let totalCapacity = 0;

      for (let floor = 1; floor <= config.totalFloors; floor++) {
        for (let roomIndex = 1; roomIndex <= config.roomsPerFloor; roomIndex++) {
          const roomNumber = generateRoomNumber(floor, roomIndex);
          const roomCode = generateRoomCode(config.buildingCode, floor, roomIndex);

          const room = new Room({
            buildingId: building._id,
            roomNumber: roomNumber,
            floor: floor,
            roomCode: roomCode,
            roomType: config.roomType,
            capacity: config.capacity,
            currentOccupancy: 0,
            roomStatus: "available",
            gender: config.buildingType,
            area: config.area,
            pricePerMonth: config.pricePerMonth,
            facilities: config.facilities.map(f => ({ ...f })),
            assignedStudents: [],
            notes: ""
          });

          rooms.push(room);
          totalRooms++;
          totalCapacity += config.capacity;
        }
      }

      await Room.insertMany(rooms);
      console.log(`✓ Tạo ${totalRooms} phòng (${config.roomsPerFloor} phòng/tầng × ${config.totalFloors} tầng)`);

      building.stats.totalRooms = totalRooms;
      building.stats.availableRooms = totalRooms;
      building.stats.totalCapacity = totalCapacity;
      await building.save();

      console.log(`✓ Cập nhật stats: ${totalRooms} phòng, capacity ${totalCapacity}`);
    }

    console.log("\n========== TỔNG KẾT ==========");
    const buildings = await Building.find();
    const rooms = await Room.find();

    console.log(`Tổng số tòa nhà: ${buildings.length}`);
    console.log(`Tổng số phòng: ${rooms.length}`);
    console.log(`Tổng sức chứa: ${buildings.reduce((sum, b) => sum + b.stats.totalCapacity, 0)} sinh viên`);

    console.log("\n--- Chi tiết từng tòa nhà ---");
    for (const building of buildings) {
      const roomCount = await Room.countDocuments({ buildingId: building._id });
      console.log(`• ${building.buildingCode}: ${building.buildingName}`);
      console.log(`  - Loại: ${building.buildingType === "male" ? "Nam" : "Nữ"}`);
      console.log(`  - Số tầng: ${building.totalFloors}`);
      console.log(`  - Số phòng: ${roomCount}`);
      console.log(`  - Sức chứa: ${building.stats.totalCapacity} SV`);
      console.log(`  - Loại phòng: ${building.roomsPerFloor || "N/A"} người/phòng`);
    }

    console.log("\n✅ SEED DATA HOÀN TẤT!");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ LỖI:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`
Usage: node script/seed-buildings-rooms.js

Script tạo tự động dữ liệu tòa nhà và phòng cho hệ thống KTX.

Tòa nhà được tạo:
  • KTX-A: Nam, 5 tầng, 4 người/phòng, 100 phòng
  • KTX-B: Nữ, 5 tầng, 4 người/phòng, 100 phòng
  • KTX-C: Nam, 10 tầng, 6 người/phòng, 300 phòng
  • KTX-D: Nữ, 10 tầng, 6 người/phòng, 300 phòng
  • KTX-E: Nam, 3 tầng, 2 người/phòng, 45 phòng (phòng VIP)
  • KTX-F: Nữ, 3 tầng, 2 người/phòng, 45 phòng (phòng VIP)

Tổng: 6 tòa nhà, 850 phòng, ~3,400 chỗ ở

Lưu ý: Script sẽ xóa toàn bộ dữ liệu tòa nhà và phòng cũ!
`);
  process.exit(0);
}

seedBuildingsAndRooms();
