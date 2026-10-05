import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { logger } from '../utils/logger';
import {
  OrganizationModel,
  UserModel,
  OrganizationMemberModel,
  SupplierModel,
  SupplierRelationshipModel,
  ProductModel,
  FacilityModel,
  CarbonFactorModel,
} from '../models';
import {
  OrganizationType,
  OrganizationStatus,
  UserRole,
  UserStatus,
  VerificationStatus,
} from '@carbonpilot/shared';

export async function runSeed() {
  logger.info('Starting CarbonPilot database seed...');
  await connectDatabase();

  try {
    // Clean existing foundational collections
    await Promise.all([
      OrganizationModel.deleteMany({}),
      UserModel.deleteMany({}),
      OrganizationMemberModel.deleteMany({}),
      SupplierModel.deleteMany({}),
      SupplierRelationshipModel.deleteMany({}),
      ProductModel.deleteMany({}),
      FacilityModel.deleteMany({}),
      CarbonFactorModel.deleteMany({}),
    ]);

    const passwordHash = await bcrypt.hash('CarbonPilot2026!', 10);

    // Seed organizations are explicitly labeled so generated demo records are not mistaken for live customers.
    const customerOrg = await OrganizationModel.create({
      name: 'Apex Mobility Corp (Demo)',
      type: OrganizationType.CUSTOMER,
      industry: 'Automotive & Heavy Mobility',
      gstin: '27AAACA1234A1Z5',
      address: '742 Innovation Way, Metro Tech District',
      website: 'https://apexmobility.example.com',
      status: OrganizationStatus.ACTIVE,
    });

    const customerAdmin = await UserModel.create({
      name: 'Elena Vance',
      email: 'elena.vance@apexmobility.example.com',
      passwordHash,
      status: UserStatus.ACTIVE,
    });

    await OrganizationMemberModel.create({
      organizationId: customerOrg._id,
      userId: customerAdmin._id,
      role: UserRole.CUSTOMER_ADMIN,
      status: UserStatus.ACTIVE,
    });

    const sustainabilityManager = await UserModel.create({
      name: 'Marcus Chen',
      email: 'marcus.chen@apexmobility.example.com',
      passwordHash,
      status: UserStatus.ACTIVE,
    });

    await OrganizationMemberModel.create({
      organizationId: customerOrg._id,
      userId: sustainabilityManager._id,
      role: UserRole.SUSTAINABILITY_MANAGER,
      status: UserStatus.ACTIVE,
    });

    // 2. Demo supplier organization 1: Titan Alloy & Steel Works (Raw Materials)
    const supplierOrg1 = await OrganizationModel.create({
      name: 'Titan Alloy & Steel Works (Demo)',
      type: OrganizationType.SUPPLIER,
      industry: 'Primary Metals & Metallurgy',
      gstin: '24AAACT9876B1Z2',
      address: 'Industrial Corridor 9, Port City',
      website: 'https://titansteel.example.com',
      status: OrganizationStatus.ACTIVE,
    });

    const supplierUser1 = await UserModel.create({
      name: 'Suresh Patel',
      email: 'suresh@titansteel.example.com',
      passwordHash,
      status: UserStatus.ACTIVE,
    });

    await OrganizationMemberModel.create({
      organizationId: supplierOrg1._id,
      userId: supplierUser1._id,
      role: UserRole.SUPPLIER_ADMIN,
      status: UserStatus.ACTIVE,
    });

    const supplier1 = await SupplierModel.create({
      organizationId: supplierOrg1._id,
      industry: 'Steel & Alloys',
      verificationStatus: VerificationStatus.IN_PROGRESS,
      dataCompleteness: 85,
      evidenceSupport: 90,
    });

    // Facilities for Supplier 1
    const facility1 = await FacilityModel.create({
      supplierId: supplier1._id,
      name: 'Titan Blast Furnace Complex #4',
      location: 'Gujarat Industrial Belt, India',
      productionCapacity: '500,000 MT/year',
      products: ['Automotive Structural Steel Coil', 'Hot-Rolled High Strength Plate'],
    });

    // Products for Supplier 1
    await ProductModel.create({
      supplierId: supplier1._id,
      name: 'Automotive Structural Steel Grade S500MC',
      productCode: 'TITAN-STL-500',
      category: 'Raw Materials - Steel',
      description: 'Micro-alloyed high yield strength cold-forming steel.',
      productionFacilityIds: [facility1._id],
      carbonData: {
        pcf: 1.82,
        unit: 'kgCO2e/kg',
        methodology: 'ISO 14067:2018',
        reportingPeriod: 'FY2023-2024',
        boundary: 'Cradle-to-Gate',
        verificationStatus: VerificationStatus.IN_PROGRESS,
      },
    });

    // 3. Demo supplier organization 2: Nexa Polymer Solutions
    const supplierOrg2 = await OrganizationModel.create({
      name: 'Nexa Polymer Solutions (Demo)',
      type: OrganizationType.SUPPLIER,
      industry: 'Chemicals & Polymers',
      gstin: '29AAACN5544C1Z1',
      address: 'Petrochemical Zone, Sector 4',
      website: 'https://nexapolymer.example.com',
      status: OrganizationStatus.ACTIVE,
    });

    const supplierUser2 = await UserModel.create({
      name: 'Ananya Sharma',
      email: 'ananya@nexapolymer.example.com',
      passwordHash,
      status: UserStatus.ACTIVE,
    });

    await OrganizationMemberModel.create({
      organizationId: supplierOrg2._id,
      userId: supplierUser2._id,
      role: UserRole.SUPPLIER_ADMIN,
      status: UserStatus.ACTIVE,
    });

    const supplier2 = await SupplierModel.create({
      organizationId: supplierOrg2._id,
      industry: 'Technical Polymers & Resins',
      verificationStatus: VerificationStatus.IN_PROGRESS,
      dataCompleteness: 60,
      evidenceSupport: 65,
    });

    const facility2 = await FacilityModel.create({
      supplierId: supplier2._id,
      name: 'Nexa EcoPolymers Plant Alpha',
      location: 'Karnataka Polymer Park',
      productionCapacity: '120,000 MT/year',
      products: ['Bio-Polyamide 6.10 Resin', 'Recycled Polycarbonate'],
    });

    await ProductModel.create({
      supplierId: supplier2._id,
      name: 'Bio-Polyamide 6.10 Polymer Granules',
      productCode: 'NEXA-PA-610',
      category: 'Polymers & Plastics',
      description: 'High performance bio-derived polymer for under-the-hood automotive clips.',
      productionFacilityIds: [facility2._id],
      carbonData: {
        pcf: 3.45,
        unit: 'kgCO2e/kg',
        methodology: 'GHG Protocol Product Standard',
        reportingPeriod: '2023',
        boundary: 'Cradle-to-Gate',
        verificationStatus: VerificationStatus.IN_PROGRESS,
      },
    });

    // 4. Supplier Relationship between Customer & Titan Steel
    await SupplierRelationshipModel.create({
      customerOrganizationId: customerOrg._id,
      supplierOrganizationId: supplierOrg1._id,
      status: 'ACTIVE',
      sharedDataPermissions: {
        carbon: true,
        energy: true,
        certificates: true,
        documents: true,
      },
    });

    // 5. Default Carbon Factors (Emission Factor Library)
    await CarbonFactorModel.insertMany([
      {
        name: 'Standard Virgin Hot-Rolled Steel',
        category: 'Metals - Ferrous',
        value: 2.15,
        unit: 'kgCO2e/kg',
        region: 'Global / Average',
        year: 2023,
        source: 'DEFRA GHG Conversion Factors',
        methodology: 'DEFRA / IPCC',
        version: '2023.1',
      },
      {
        name: 'Virgin Polypropylene Granules',
        category: 'Plastics & Polymers',
        value: 1.95,
        unit: 'kgCO2e/kg',
        region: 'Global / Average',
        year: 2023,
        source: 'Ecoinvent v3.9',
        methodology: 'ISO 14040/44',
        version: '3.9',
      },
      {
        name: 'Industrial Grid Electricity (India Central)',
        category: 'Electricity & Heat',
        value: 0.72,
        unit: 'kgCO2e/kWh',
        region: 'India',
        year: 2023,
        source: 'CEA CO2 Baseline Database',
        methodology: 'CEA Version 19',
        version: '19.0',
      },
    ]);

    logger.info('✅ CarbonPilot database seeded successfully!');
    logger.info('Sample Login Credentials:');
    logger.info('Customer Admin: elena.vance@apexmobility.example.com / CarbonPilot2026!');
    logger.info('Sustainability Mgr: marcus.chen@apexmobility.example.com / CarbonPilot2026!');
    logger.info('Supplier Admin: suresh@titansteel.example.com / CarbonPilot2026!');
  } catch (error) {
    logger.error('Failed to run seed script', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    await disconnectDatabase();
  }
}

if (require.main === module) {
  runSeed().then(() => process.exit(0)).catch(() => process.exit(1));
}
