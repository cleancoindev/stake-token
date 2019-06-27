pragma solidity 0.5.9;

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./Token/ERC677BridgeToken.sol";

contract Distribution is Ownable {
    using SafeMath for uint256;

    ERC677BridgeToken token;

    uint8 constant REWARD_FOR_STAKING = 1;
    uint8 constant ECOSYSTEM_FUND = 2;
    uint8 constant PUBLIC_OFFERING = 3;
    uint8 constant PRIVATE_OFFERING = 4;
    uint8 constant FOUNDATION_REWARD = 5;

    mapping (uint8 => address) poolAddress;
    mapping (uint8 => uint256) stake;
    mapping (uint8 => uint256) tokensLeft;
    mapping (uint8 => uint256) cliff;
    mapping (uint8 => uint256) numberOfInstallments;
    mapping (uint8 => uint256) installmentsDone;
    mapping (uint8 => uint256) installmentValue;
    mapping (uint8 => uint256) valueAtCliff;
    mapping (uint8 => uint256) lastInstallmentDate;

    address[] privateOfferingParticipants;
    uint256[] privateOfferingParticipantsStakes;

    uint256 constant supply = 100000000 ether;

    uint256 distributionStartDate;

    bool isInitialized = false;

    modifier initialized() {
        require(isInitialized, "not initialized");
        _;
    }

    constructor() public {
        stake[REWARD_FOR_STAKING] = 73000000 ether;
        stake[ECOSYSTEM_FUND] = 15000000 ether;
        stake[PUBLIC_OFFERING] = 4000000 ether;
        stake[PRIVATE_OFFERING] = 4000000 ether;
        stake[FOUNDATION_REWARD] = 4000000 ether;

        tokensLeft[ECOSYSTEM_FUND] = stake[ECOSYSTEM_FUND];
        tokensLeft[PRIVATE_OFFERING] = stake[PRIVATE_OFFERING];
        tokensLeft[FOUNDATION_REWARD] = stake[FOUNDATION_REWARD];

        valueAtCliff[ECOSYSTEM_FUND] = stake[ECOSYSTEM_FUND].mul(10).div(100);       // 10%
        valueAtCliff[PRIVATE_OFFERING] = stake[PRIVATE_OFFERING].mul(35).div(100);   // 35%
        valueAtCliff[FOUNDATION_REWARD] = stake[FOUNDATION_REWARD].mul(20).div(100); // 20%

        cliff[REWARD_FOR_STAKING] = 12 weeks;
        cliff[ECOSYSTEM_FUND] = 48 weeks;
        cliff[FOUNDATION_REWARD] = 12 weeks;

        numberOfInstallments[ECOSYSTEM_FUND] = 96;
        numberOfInstallments[PRIVATE_OFFERING] = 36;
        numberOfInstallments[FOUNDATION_REWARD] = 48;

        installmentValue[ECOSYSTEM_FUND] = _calculateInstallmentValue(ECOSYSTEM_FUND);
        installmentValue[PRIVATE_OFFERING] = _calculateInstallmentValue(PRIVATE_OFFERING);
        installmentValue[FOUNDATION_REWARD] = _calculateInstallmentValue(FOUNDATION_REWARD);

    }

    function initialize(
        address _tokenAddress,
        address _ecosystemFundAddress,
        address _publicOfferingAddress,
        address _foundationAddress,
        address[] calldata _privateOfferingParticipants,
        uint256[] calldata _privateOfferingParticipantsStakes
    ) external onlyOwner {
        require(!isInitialized, "already initialized");

        token = ERC677BridgeToken(_tokenAddress);
        uint256 _balance = token.balanceOf(address(this));
        require(_balance == supply, "wrong contract balance");

        distributionStartDate = token.created();

        _validateAddress(_ecosystemFundAddress);
        _validateAddress(_publicOfferingAddress);
        _validateAddress(_foundationAddress);
        _validateAddresses(_privateOfferingParticipants);

        poolAddress[ECOSYSTEM_FUND] = _ecosystemFundAddress;
        poolAddress[FOUNDATION_REWARD] = _foundationAddress;

        privateOfferingParticipants = _privateOfferingParticipants;
        privateOfferingParticipantsStakes = _privateOfferingParticipantsStakes;

        token.transfer(_publicOfferingAddress, stake[PUBLIC_OFFERING]); // 100%
        _distributeTokensForPrivateOffering();

        isInitialized = true;
    }

    // function unlockRewardForStaking(address _bridgeAddress) external onlyOwner {
    //     uint256 _cliff = 12 weeks;
    //     require(now > distributionStartDate.add(_cliff), "too early"); // solium-disable-line security/no-block-members

    // }

    function _validateAddress(address _address) internal pure {
        if (_address == address(0)) {
            revert("invalid address");
        }
    }

    function _validateAddresses(address[] memory _addresses) internal pure {
        for (uint256 _i; _i < _addresses.length; _i++) {
            _validateAddress(_addresses[_i]);
        }
    }

    function _calculateInstallmentValue(uint8 _pool) internal view returns (uint256) {
        return stake[_pool].sub(valueAtCliff[_pool]).div(numberOfInstallments[_pool]);
    }

    function _distributeTokensForPrivateOffering() internal view {} // solium-disable-line
}