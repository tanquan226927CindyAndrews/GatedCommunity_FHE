// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract PrivateGatedCommunity is SepoliaConfig {
    struct Community {
        address owner;
        string name;
        address nftContract; // NFT contract for access control
        uint256 minTokenId;
        uint256 maxTokenId;
    }
    
    struct EncryptedContent {
        euint32 encryptedData; // Encrypted community content
        uint256 timestamp;
    }
    
    struct Membership {
        ebool encryptedVerification; // Encrypted membership verification
        bool isVerified;
    }

    // Contract state
    uint256 public communityCount;
    mapping(uint256 => Community) public communities;
    mapping(uint256 => EncryptedContent[]) public communityContent;
    mapping(uint256 => mapping(address => Membership)) public memberships;
    
    // Decryption tracking
    mapping(uint256 => uint256) private requestToContentId;
    mapping(uint256 => uint256) private requestToCommunityId;
    
    // Events
    event CommunityCreated(uint256 indexed id, address owner);
    event ContentAdded(uint256 indexed communityId, uint256 contentId);
    event MembershipVerified(address indexed member, uint256 indexed communityId);
    event DecryptionRequested(uint256 indexed contentId);
    event ContentDecrypted(uint256 indexed contentId);

    /// @notice Create a new gated community
    function createCommunity(
        string memory name,
        address nftContract,
        uint256 minTokenId,
        uint256 maxTokenId
    ) public {
        communityCount++;
        uint256 newId = communityCount;
        
        communities[newId] = Community({
            owner: msg.sender,
            name: name,
            nftContract: nftContract,
            minTokenId: minTokenId,
            maxTokenId: maxTokenId
        });
        
        emit CommunityCreated(newId, msg.sender);
    }

    /// @notice Verify NFT ownership for community access
    function verifyMembership(uint256 communityId) public {
        Community storage community = communities[communityId];
        require(community.owner != address(0), "Community not found");
        
        // Check NFT ownership range
        bool hasAccess = false;
        for (uint256 i = community.minTokenId; i <= community.maxTokenId; i++) {
            if (IERC721(community.nftContract).ownerOf(i) == msg.sender) {
                hasAccess = true;
                break;
            }
        }
        
        // Store encrypted verification status
        memberships[communityId][msg.sender] = Membership({
            encryptedVerification: FHE.asEbool(hasAccess),
            isVerified: hasAccess
        });
        
        emit MembershipVerified(msg.sender, communityId);
    }

    /// @notice Add encrypted content to community
    function addContent(
        uint256 communityId,
        euint32 encryptedData
    ) public {
        require(memberships[communityId][msg.sender].isVerified, "Not a member");
        
        uint256 contentId = communityContent[communityId].length;
        communityContent[communityId].push(EncryptedContent({
            encryptedData: encryptedData,
            timestamp: block.timestamp
        }));
        
        emit ContentAdded(communityId, contentId);
    }

    /// @notice Request content decryption
    function requestContentDecryption(
        uint256 communityId,
        uint256 contentId
    ) public {
        require(memberships[communityId][msg.sender].isVerified, "Not a member");
        require(contentId < communityContent[communityId].length, "Invalid content");
        
        bytes32[] memory ciphertexts = new bytes32[](1);
        ciphertexts[0] = FHE.toBytes32(communityContent[communityId][contentId].encryptedData);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptContentCallback.selector);
        requestToContentId[reqId] = contentId;
        requestToCommunityId[reqId] = communityId;
        
        emit DecryptionRequested(contentId);
    }

    /// @notice Handle content decryption callback
    function decryptContentCallback(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 contentId = requestToContentId[requestId];
        uint256 communityId = requestToCommunityId[requestId];
        require(contentId != 0 && communityId != 0, "Invalid request");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        // Process decrypted content (could be stored or emitted)
        uint32 data = abi.decode(cleartexts, (uint32));
        // Handle decrypted content as needed
        
        emit ContentDecrypted(contentId);
    }

    /// @notice Get encrypted membership status
    function getEncryptedMembership(
        uint256 communityId,
        address member
    ) public view returns (ebool) {
        return memberships[communityId][member].encryptedVerification;
    }

    /// @notice Check membership status
    function isMember(
        uint256 communityId,
        address member
    ) public view returns (bool) {
        return memberships[communityId][member].isVerified;
    }

    /// @notice Get community content count
    function getContentCount(uint256 communityId) public view returns (uint256) {
        return communityContent[communityId].length;
    }

    /// @notice Get encrypted content
    function getEncryptedContent(
        uint256 communityId,
        uint256 contentId
    ) public view returns (euint32) {
        require(contentId < communityContent[communityId].length, "Invalid content");
        return communityContent[communityId][contentId].encryptedData;
    }
}