import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";

describe("CertificateRegistry", async function () {
  const { viem } = await network.create();
  const [owner, administrator, recipient, stranger] = await viem.getWalletClients();

  const now = (await (await viem.getPublicClient()).getBlock()).timestamp;
  const validRecord = {
    name: "Amina Benali",
    studentId: "2023-INF-042",
    title: "Licence Informatique",
    issueDate: now - 60n,
    grade: 1650n,
    recipient: recipient.account.address,
  };

  async function deployRegistry() {
    return viem.deployContract("CertificateRegistry");
  }

  async function mint(
    registry: Awaited<ReturnType<typeof deployRegistry>>,
    overrides: Partial<typeof validRecord> = {},
    options: { account?: typeof stranger.account } = {},
  ) {
    const record = { ...validRecord, ...overrides };
    return registry.write.mintCertificate([
      record.name,
      record.studentId,
      record.title,
      record.issueDate,
      record.grade,
      record.recipient,
    ], options);
  }

  it("lets the owner issue a certificate and stores the scaled grade", async function () {
    const registry = await deployRegistry();
    await viem.assertions.emitWithArgs(
      mint(registry),
      registry,
      "CertificateMinted",
      [1n, validRecord.studentId, validRecord.recipient],
    );

    const { studentName, studentId, diplomaTitle, issueDate, grade, recipient: storedRecipient, revoked } =
      await registry.read.getCertificate([1n]);
    assert.equal(studentName, validRecord.name);
    assert.equal(studentId, validRecord.studentId);
    assert.equal(diplomaTitle, validRecord.title);
    assert.equal(issueDate, validRecord.issueDate);
    assert.equal(grade, 1650n);
    assert.equal(storedRecipient.toLowerCase(), validRecord.recipient.toLowerCase());
    assert.equal(revoked, false);
    assert.equal(await registry.read.nextCertId(), 2n);
    assert.equal(await registry.read.totalCertificates(), 1n);
  });

  it("allows an authorized administrator and rejects an unauthorized wallet", async function () {
    const registry = await deployRegistry();
    await registry.write.addAdmin([administrator.account.address]);
    await mint(registry, { studentId: "2023-INF-043" }, { account: administrator.account });
    await viem.assertions.revertWith(
      mint(registry, { studentId: "2023-INF-044" }, { account: stranger.account }),
      "Not authorized",
    );
  });

  it("rejects an active duplicate student and diploma pair but permits another diploma", async function () {
    const registry = await deployRegistry();
    await mint(registry);
    await viem.assertions.revertWith(mint(registry), "Duplicate certificate");
    await mint(registry, { title: "Master Informatique" });
    assert.equal(await registry.read.totalCertificates(), 2n);
  });

  it("rejects invalid required fields, future dates, and grades above 20", async function () {
    const registry = await deployRegistry();
    await viem.assertions.revertWith(mint(registry, { name: "" }), "Student name required");
    await viem.assertions.revertWith(mint(registry, { studentId: " \t" }), "Student ID required");
    await viem.assertions.revertWith(mint(registry, { issueDate: now + 86400n }), "Invalid issue date");
    await viem.assertions.revertWith(mint(registry, { grade: 2001n }), "Grade must be between 0 and 20");
    assert.equal(await registry.read.nextCertId(), 1n);
  });

  it("issues a valid batch with consecutive IDs", async function () {
    const registry = await deployRegistry();
    await registry.write.batchMint([
      ["Amina Benali", "Youssef Idrissi", "Sara Amrani"],
      ["2023-INF-042", "2023-INF-043", "2023-INF-044"],
      ["Licence Informatique", "Licence Informatique", "Licence Informatique"],
      [now - 60n, now - 60n, now - 60n],
      [1650n, 1725n, 1800n],
      [recipient.account.address, stranger.account.address, "0x0000000000000000000000000000000000000000"],
    ]);

    assert.equal(await registry.read.nextCertId(), 4n);
    assert.equal(await registry.read.totalCertificates(), 3n);
    const { studentName, grade } = await registry.read.getCertificate([2n]);
    assert.equal(studentName, "Youssef Idrissi");
    assert.equal(grade, 1725n);
  });

  it("rejects mismatched arrays, invalid rows, batch duplicates, oversized batches, and unauthorized batches", async function () {
    const registry = await deployRegistry();
    await viem.assertions.revertWith(
      registry.write.batchMint([["Amina"], [], ["Licence"], [now], [1600n], [recipient.account.address]]),
      "Array length mismatch",
    );
    await viem.assertions.revertWith(
      registry.write.batchMint(
        [["Amina", "Youssef"], ["S-1", "S-1"], ["Licence", "Licence"], [now, now], [1600n, 1600n], [recipient.account.address, recipient.account.address]],
      ),
      "Duplicate in batch",
    );
    await viem.assertions.revertWith(
      registry.write.batchMint([
        ["Amina", "Youssef"], ["S-3", "S-4"], ["Licence", "Licence"], [now, now], [1600n, 2100n],
        [recipient.account.address, recipient.account.address],
      ]),
      "Grade must be between 0 and 20",
    );
    const repeatedArrays = Array.from({ length: 51 }, (_, index) => `Student ${index}`);
    await viem.assertions.revertWith(
      registry.write.batchMint([
        repeatedArrays,
        repeatedArrays,
        repeatedArrays,
        repeatedArrays.map(() => now),
        repeatedArrays.map(() => 1500n),
        repeatedArrays.map(() => recipient.account.address),
      ]),
      "Batch too large",
    );
    await viem.assertions.revertWith(
      registry.write.batchMint(
        [["Amina"], ["S-4"], ["Licence"], [now], [1600n], [recipient.account.address]],
        { account: stranger.account },
      ),
      "Not authorized",
    );
    assert.equal(await registry.read.nextCertId(), 1n);
    assert.equal(await registry.read.totalCertificates(), 0n);
    assert.equal(await registry.read.isCertificateIssued(["S-3", "Licence"]), false);
  });

  it("keeps reads public and rejects nonexistent certificate IDs", async function () {
    const registry = await deployRegistry();
    assert.equal(await registry.read.isAdmin([stranger.account.address]), false);
    await mint(registry);
    const publicRead = await registry.read.getCertificate([1n], { account: stranger.account });
    assert.equal(publicRead.studentName, validRecord.name);
    await viem.assertions.revertWith(registry.read.getCertificate([0n]), "Certificate not found");
    await viem.assertions.revertWith(registry.read.getCertificate([2n]), "Certificate not found");
    await viem.assertions.revertWith(registry.write.revokeCertificate([2n]), "Certificate not found");
  });

  it("revokes without deleting history, blocks repeats, and permits corrected reissue", async function () {
    const registry = await deployRegistry();
    await mint(registry);
    const pair = [validRecord.studentId, validRecord.title] as const;
    assert.equal(await registry.read.isCertificateIssued(pair), true);
    await registry.write.addAdmin([administrator.account.address]);
    await viem.assertions.emitWithArgs(
      registry.write.revokeCertificate([1n], { account: administrator.account }),
      registry,
      "CertificateRevoked",
      [1n],
    );
    await viem.assertions.revertWith(registry.write.revokeCertificate([1n]), "Already revoked");
    assert.equal(await registry.read.isCertificateIssued(pair), false);
    await viem.assertions.revertWith(
      registry.write.revokeCertificate([1n], { account: stranger.account }),
      "Not authorized",
    );
    await mint(registry, { name: "Amina Benali corrected" });
    const original = await registry.read.getCertificate([1n]);
    assert.equal(original.studentName, validRecord.name);
    assert.equal(original.revoked, true);
    assert.equal(await registry.read.isCertificateIssued(pair), true);
    assert.equal(await registry.read.totalCertificates(), 2n);
  });

  it("restricts administrator management to the owner and protects owner access", async function () {
    const registry = await deployRegistry();
    assert.equal(await registry.read.isAdmin([owner.account.address]), true);
    await viem.assertions.revertWith(
      registry.write.addAdmin([administrator.account.address], { account: stranger.account }),
      "Not owner",
    );
    await viem.assertions.revertWith(registry.write.addAdmin(["0x0000000000000000000000000000000000000000"]), "Invalid admin address");
    await registry.write.addAdmin([administrator.account.address]);
    await viem.assertions.revertWith(registry.write.addAdmin([administrator.account.address]), "Already admin");
    assert.deepEqual((await registry.read.getAdmins()).map(address => address.toLowerCase()), [owner.account.address, administrator.account.address].map(address => address.toLowerCase()));
    await viem.assertions.revertWith(registry.write.removeAdmin([owner.account.address]), "Cannot remove owner");
    await viem.assertions.revertWith(
      registry.write.removeAdmin([administrator.account.address], { account: stranger.account }),
      "Not owner",
    );
    await registry.write.removeAdmin([administrator.account.address]);
    assert.equal(await registry.read.isAdmin([administrator.account.address]), false);
    assert.deepEqual((await registry.read.getAdmins()).map(address => address.toLowerCase()), [owner.account.address.toLowerCase()]);
  });
});
