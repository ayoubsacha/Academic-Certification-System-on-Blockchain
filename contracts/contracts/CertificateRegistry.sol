// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

contract CertificateRegistry {
    struct CertificateInput {
        string studentName;
        string studentId;
        string diplomaTitle;
        uint256 issueDate;
        uint256 grade;
        address recipient;
    }

    struct Certificate {
        string studentName;
        string studentId;
        string diplomaTitle;
        uint256 issueDate;
        uint256 grade;
        address recipient;
        bool revoked;
    }

    mapping(uint256 => Certificate) public certificates;
    mapping(address => bool) public admins;

    uint256 public nextCertId = 1;
    uint256 public totalCertificates;
    uint256 public constant MAX_BATCH_SIZE = 50;
    uint256 private constant MAX_NAME_LENGTH = 120;
    uint256 private constant MAX_STUDENT_ID_LENGTH = 80;
    uint256 private constant MAX_DIPLOMA_TITLE_LENGTH = 160;

    address public immutable owner;

    // This points to the newest certificate for the student/diploma pair. A
    // revoked record may be replaced, while its original on-chain history stays intact.
    mapping(bytes32 => uint256) private _latestCertificateForPair;
    address[] private _adminList;
    mapping(address => uint256) private _adminIndexPlusOne;

    event CertificateMinted(
        uint256 indexed certId,
        string studentId,
        address indexed recipient
    );
    event CertificateRevoked(uint256 indexed certId);
    event AdminAdded(address indexed account);
    event AdminRemoved(address indexed account);

    modifier onlyAdmin() {
        require(admins[msg.sender], "Not authorized");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        admins[msg.sender] = true;
        _adminList.push(msg.sender);
        _adminIndexPlusOne[msg.sender] = 1;
        emit AdminAdded(msg.sender);
    }

    function mintCertificate(
        string calldata studentName,
        string calldata studentId,
        string calldata diplomaTitle,
        uint256 issueDate,
        uint256 grade,
        address recipient
    ) external onlyAdmin returns (uint256 certId) {
        _validateCertificate(studentName, studentId, diplomaTitle, issueDate, grade);
        bytes32 pairKey = _pairKey(studentId, diplomaTitle);
        _requirePairAvailable(pairKey);

        certId = _storeCertificate(
            CertificateInput(studentName, studentId, diplomaTitle, issueDate, grade, recipient),
            pairKey
        );
    }

    function batchMint(
        string[] calldata studentNames,
        string[] calldata studentIds,
        string[] calldata diplomaTitles,
        uint256[] calldata issueDates,
        uint256[] calldata grades,
        address[] calldata recipients
    ) external onlyAdmin {
        uint256 length = studentNames.length;
        require(length > 0, "Empty batch");
        require(length <= MAX_BATCH_SIZE, "Batch too large");
        require(
            studentIds.length == length &&
                diplomaTitles.length == length &&
                issueDates.length == length &&
                grades.length == length &&
                recipients.length == length,
            "Array length mismatch"
        );

        // Validate the full batch before writing. Cache each pair hash to bound
        // the cost of checking duplicates within the batch.
        bytes32[] memory pairKeys = new bytes32[](length);
        for (uint256 i = 0; i < length; i++) {
            _validateCertificate(
                studentNames[i],
                studentIds[i],
                diplomaTitles[i],
                issueDates[i],
                grades[i]
            );

            bytes32 pairKey = _pairKey(studentIds[i], diplomaTitles[i]);
            _requirePairAvailable(pairKey);

            for (uint256 j = 0; j < i; j++) {
                require(pairKey != pairKeys[j], "Duplicate in batch");
            }
            pairKeys[i] = pairKey;
        }

        for (uint256 i = 0; i < length; i++) {
            _storeCertificate(
                CertificateInput(
                    studentNames[i],
                    studentIds[i],
                    diplomaTitles[i],
                    issueDates[i],
                    grades[i],
                    recipients[i]
                ),
                pairKeys[i]
            );
        }
    }

    function getCertificate(uint256 certId) external view returns (Certificate memory) {
        require(certId > 0 && certId < nextCertId, "Certificate not found");
        return certificates[certId];
    }

    function isAdmin(address account) external view returns (bool) {
        return admins[account];
    }

    function isCertificateIssued(string calldata studentId, string calldata diplomaTitle)
        external
        view
        returns (bool)
    {
        uint256 certId = _latestCertificateForPair[_pairKey(studentId, diplomaTitle)];
        return certId != 0 && !certificates[certId].revoked;
    }

    function getAdmins() external view returns (address[] memory) {
        return _adminList;
    }

    function addAdmin(address account) external onlyOwner {
        require(account != address(0), "Invalid admin address");
        require(!admins[account], "Already admin");
        admins[account] = true;
        _adminList.push(account);
        _adminIndexPlusOne[account] = _adminList.length;
        emit AdminAdded(account);
    }

    function removeAdmin(address account) external onlyOwner {
        require(account != owner, "Cannot remove owner");
        require(admins[account], "Not an admin");

        admins[account] = false;
        uint256 index = _adminIndexPlusOne[account] - 1;
        uint256 lastIndex = _adminList.length - 1;
        if (index != lastIndex) {
            address lastAccount = _adminList[lastIndex];
            _adminList[index] = lastAccount;
            _adminIndexPlusOne[lastAccount] = index + 1;
        }
        _adminList.pop();
        delete _adminIndexPlusOne[account];
        emit AdminRemoved(account);
    }

    function revokeCertificate(uint256 certId) external onlyAdmin {
        require(certId > 0 && certId < nextCertId, "Certificate not found");
        Certificate storage certificate = certificates[certId];
        require(!certificate.revoked, "Already revoked");
        certificate.revoked = true;
        emit CertificateRevoked(certId);
    }

    function _validateCertificate(
        string calldata studentName,
        string calldata studentId,
        string calldata diplomaTitle,
        uint256 issueDate,
        uint256 grade
    ) private view {
        require(_hasText(studentName), "Student name required");
        require(bytes(studentName).length <= MAX_NAME_LENGTH, "Student name too long");
        require(_hasText(studentId), "Student ID required");
        require(bytes(studentId).length <= MAX_STUDENT_ID_LENGTH, "Student ID too long");
        require(_hasText(diplomaTitle), "Diploma title required");
        require(bytes(diplomaTitle).length <= MAX_DIPLOMA_TITLE_LENGTH, "Diploma title too long");
        require(issueDate > 0 && issueDate <= block.timestamp, "Invalid issue date");
        require(grade <= 2000, "Grade must be between 0 and 20");
    }

    function _requirePairAvailable(bytes32 pairKey) private view {
        uint256 existingId = _latestCertificateForPair[pairKey];
        require(
            existingId == 0 || certificates[existingId].revoked,
            "Duplicate certificate"
        );
    }

    function _storeCertificate(
        CertificateInput memory input,
        bytes32 pairKey
    ) private returns (uint256 certId) {
        certId = nextCertId++;
        certificates[certId] = Certificate({
            studentName: input.studentName,
            studentId: input.studentId,
            diplomaTitle: input.diplomaTitle,
            issueDate: input.issueDate,
            grade: input.grade,
            recipient: input.recipient,
            revoked: false
        });
        _latestCertificateForPair[pairKey] = certId;
        totalCertificates++;
        emit CertificateMinted(certId, input.studentId, input.recipient);
    }

    function _pairKey(string calldata studentId, string calldata diplomaTitle)
        private
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(studentId, diplomaTitle));
    }

    function _hasText(string calldata value) private pure returns (bool) {
        bytes calldata raw = bytes(value);
        for (uint256 i = 0; i < raw.length; i++) {
            if (uint8(raw[i]) > 32) return true;
        }
        return false;
    }
}
