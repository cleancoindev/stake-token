const DistributionMock = artifacts.require('DistributionMock');
const PrivateOfferingDistribution = artifacts.require('PrivateOfferingDistribution');
const PrivateOfferingDistributionMock = artifacts.require('PrivateOfferingDistributionMock');
const ERC677BridgeToken = artifacts.require('ERC677BridgeToken');
const BridgeTokenMock = artifacts.require('BridgeTokenMock');
const EmptyContract = artifacts.require('EmptyContract');

const { mineBlock } = require('./helpers/ganache');

const { BN, toWei, fromWei } = web3.utils;

require('chai')
    .use(require('chai-as-promised'))
    .use(require('chai-bn')(BN))
    .should();


contract('PrivateOfferingDistribution', async accounts => {

    const {
        ERROR_MSG,
        TOKEN_NAME,
        TOKEN_SYMBOL,
        EMPTY_ADDRESS,
        STAKING_EPOCH_DURATION,
        REWARD_FOR_STAKING,
        ECOSYSTEM_FUND,
        PUBLIC_OFFERING,
        PRIVATE_OFFERING,
        FOUNDATION_REWARD,
        EXCHANGE_RELATED_ACTIVITIES,
        owner,
        address,
        stake,
        cliff,
        percentAtCliff,
        numberOfInstallments,
        PRIVATE_OFFERING_PRERELEASE,
        SUPPLY,
        privateOfferingParticipants,
        privateOfferingParticipantsStakes,
    } = require('./constants')(accounts);

    let privateOfferingDistribution;
    let distribution;
    let token;

    function createToken(distributionAddress, privateOfferingDistributionAddress) {
        return ERC677BridgeToken.new(
            TOKEN_NAME,
            TOKEN_SYMBOL,
            distributionAddress,
            privateOfferingDistributionAddress
        );
    }

    function createPrivateOfferingDistribution() {
        return PrivateOfferingDistribution.new().should.be.fulfilled;
    }

    async function createDistribution(privateOfferingDistributionAddress) {
        return DistributionMock.new(
            STAKING_EPOCH_DURATION,
            address[REWARD_FOR_STAKING],
            address[ECOSYSTEM_FUND],
            address[PUBLIC_OFFERING],
            privateOfferingDistributionAddress,
            address[FOUNDATION_REWARD],
            address[EXCHANGE_RELATED_ACTIVITIES]
        ).should.be.fulfilled;
    }

    function calculatePercentage(number, percentage) {
        return new BN(number).mul(new BN(percentage)).div(new BN(100));
    }

    function getBalances(addresses) {
        return Promise.all(addresses.map(addr => token.balanceOf(addr)));
    }

    function random(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function randomAccount() {
        return accounts[random(10, 19)];
    }

    function toLowerCase(array) {
        return array.map(item => item.toLowerCase());
    }

    function compareAddresses(array1, array2) {
        const sameSize = array1.length === array2.length;
        return sameSize && toLowerCase(array1).slice().sort().every((value, index) =>
            value === toLowerCase(array2).slice().sort()[index]
        );
    }

    async function addParticipants(participants, participantsStakes) {
        await privateOfferingDistribution.addParticipants(participants, participantsStakes).should.be.fulfilled;
        const stakes = await Promise.all(participants.map(participant =>
            privateOfferingDistribution.participantStake.call(participant)
        ));
        participantsStakes.forEach((stake, index) => stake.should.be.bignumber.equal(stakes[index]));
    }

    async function addAndFinalizedParticipants(participants, participantsStakes) {
        await privateOfferingDistribution.addParticipants(participants, participantsStakes).should.be.fulfilled;
        await privateOfferingDistribution.finalizeParticipants().should.be.fulfilled;
        const stakes = await Promise.all(
            [...participants, EMPTY_ADDRESS].map(participant =>
                privateOfferingDistribution.participantStake.call(participant)
            )
        );
        const sumOfStakes = participantsStakes.reduce((acc, cur) => acc.add(cur), new BN(0));
        const zeroAddressStake = stake[PRIVATE_OFFERING].sub(sumOfStakes);
        [...participantsStakes, zeroAddressStake].forEach((stake, index) =>
            stake.should.be.bignumber.equal(stakes[index])
        );
    }

    async function prepare(
        participants = privateOfferingParticipants,
        stakes = privateOfferingParticipantsStakes
    ) {
        privateOfferingDistribution = await PrivateOfferingDistribution.new(
            participants,
            stakes
        );
        distribution = await createDistribution(privateOfferingDistribution.address);
        await privateOfferingDistribution.setDistributionAddress(distribution.address);
        await privateOfferingDistribution.addParticipants(participants, stakes);
        await privateOfferingDistribution.finalizeParticipants();
        token = await BridgeTokenMock.new(
            TOKEN_NAME,
            TOKEN_SYMBOL,
            distribution.address,
            privateOfferingDistribution.address
        );
        await distribution.setToken(token.address);
        await distribution.initializePrivateOfferingDistribution();
    }

    async function withdrawOfBurn(method, participant, participantStake) {
        const maxBalanceForCurrentEpoch = await privateOfferingDistribution.maxBalanceForCurrentEpoch();
        const paidValue = await privateOfferingDistribution.paidAmount(participant);
        const maxShare = maxBalanceForCurrentEpoch.mul(participantStake).div(stake[PRIVATE_OFFERING]);
        const currentShare = maxShare.sub(paidValue);
        const balanceBefore = await token.balanceOf(participant);
        const sender = method === 'burn' ? owner : participant;
        await privateOfferingDistribution[method]({ from: sender }).should.be.fulfilled;
        const balanceAfter = await token.balanceOf(participant);
        balanceAfter.should.be.bignumber.equal(balanceBefore.add(currentShare));
    }

    function withdraw(participant, participantStake) {
        return withdrawOfBurn('withdraw', participant, participantStake);
    }

    function burn(zeroStake) {
        return withdrawOfBurn('burn', EMPTY_ADDRESS, zeroStake);
    }

    describe('addParticipants', async () => {
        beforeEach(async () => {
            privateOfferingDistribution = await PrivateOfferingDistributionMock.new().should.be.fulfilled;
        });
        it('should be added', async () => {
            await addParticipants(privateOfferingParticipants, privateOfferingParticipantsStakes);
        });
        it('should be added 50 participants', async () => {
            const participants = await Promise.all([...Array(50)].map(() => web3.eth.personal.newAccount()));
            const participantsStakes = [...Array(50)].map(() => new BN(toWei(String(random(1, 170000)))));
            await addParticipants(participants, participantsStakes);
        });
        it('cannot be added with wrong values', async () => {
            await privateOfferingDistribution.addParticipants(
                [accounts[6], accounts[7]],
                [toWei('1')],
            ).should.be.rejectedWith('different arrays sizes');
            await privateOfferingDistribution.addParticipants(
                [accounts[6], EMPTY_ADDRESS],
                [toWei('1'), toWei('1')],
            ).should.be.rejectedWith('invalid address');
            await privateOfferingDistribution.addParticipants(
                [accounts[6], accounts[7]],
                [toWei('1'), 0],
            ).should.be.rejectedWith('the participant stake must be more than 0');
            await privateOfferingDistribution.addParticipants(
                [accounts[6], accounts[7]],
                [toWei('3000000'), toWei('6000000')],
            ).should.be.rejectedWith('wrong sum of values');

            await privateOfferingDistribution.addParticipants(
                [accounts[6], accounts[7]],
                [toWei('3000000'), toWei('4000000')],
            ).should.be.fulfilled;
            await privateOfferingDistribution.addParticipants(
                [accounts[6], accounts[7]],
                [toWei('3000000'), toWei('4000000')],
            ).should.be.rejectedWith('participant already added');
            await privateOfferingDistribution.addParticipants(
                [accounts[8], accounts[9]],
                [toWei('1000000'), toWei('2000000')],
            ).should.be.rejectedWith('wrong sum of values');
        });
        it('cannot be added if finalized', async () => {
            const participants = await Promise.all([...Array(10)].map(() => web3.eth.personal.newAccount()));
            const participantsStakes = [...Array(10)].map(() => new BN(toWei(String(random(1, 850000)))));
            await privateOfferingDistribution.addParticipants(
                participants.slice(0, 5),
                participantsStakes.slice(0, 5)
            ).should.be.fulfilled;
            await privateOfferingDistribution.finalizeParticipants().should.be.fulfilled;
            await privateOfferingDistribution.addParticipants(
                participants.slice(5, 10),
                participantsStakes.slice(5, 10)
            ).should.be.rejectedWith('already finalized');
        });
        it('should be added (250 participants)', async () => {
            const participants = await Promise.all([...Array(250)].map(() => web3.eth.personal.newAccount()));
            const participantsStakes = [...Array(250)].map(() => new BN(toWei(String(random(1, 17000)))));
            await addParticipants(participants.slice(0, 50), participantsStakes.slice(0, 50));
            await addParticipants(participants.slice(50, 100), participantsStakes.slice(50, 100));
            await addParticipants(participants.slice(100, 150), participantsStakes.slice(100, 150));
            await addParticipants(participants.slice(150, 200), participantsStakes.slice(150, 200));
            await addParticipants(participants.slice(200, 250), participantsStakes.slice(200, 250));
            const participantsFromContract = await privateOfferingDistribution.getParticipants();
            compareAddresses(participants, participantsFromContract).should.be.equal(true);
        });
    });
    describe('finalizeParticipants', async () => {
        beforeEach(async () => {
            privateOfferingDistribution = await PrivateOfferingDistributionMock.new().should.be.fulfilled;
        });
        it('should be finalized', async () => {
            await addAndFinalizedParticipants(privateOfferingParticipants, privateOfferingParticipantsStakes);
        });
        it('should be finalized with sum of stakes which is less than the whole pool stake', async () => {
            const participants = [accounts[6], accounts[7]];
            const participantsStakes = [new BN(toWei('4500000')), new BN(toWei('2999999'))];
            await addAndFinalizedParticipants(participants, participantsStakes);
        });
        it('should be finalized with 500 participants', async () => {
            const participants = await Promise.all([...Array(500)].map(() => web3.eth.personal.newAccount()));
            const participantsStakes = [...Array(500)].map(() => new BN(toWei(String(random(1, 17000)))));
            await addParticipants(participants.slice(0, 50), participantsStakes.slice(0, 50));
            await addParticipants(participants.slice(50, 100), participantsStakes.slice(50, 100));
            await addParticipants(participants.slice(100, 150), participantsStakes.slice(100, 150));
            await addParticipants(participants.slice(150, 200), participantsStakes.slice(150, 200));
            await addParticipants(participants.slice(200, 250), participantsStakes.slice(200, 250));
            await privateOfferingDistribution.finalizeParticipants().should.be.fulfilled;
        });
        it('cannot be finalized twice', async () => {
            await addParticipants(privateOfferingParticipants, privateOfferingParticipantsStakes);
            await privateOfferingDistribution.finalizeParticipants().should.be.fulfilled;
            await privateOfferingDistribution.finalizeParticipants().should.be.rejectedWith('already finalized');
        });
    });
    describe('initialize', async () => {
        let distributionAddress = owner;
        beforeEach(async () => {
            privateOfferingDistribution = await PrivateOfferingDistributionMock.new().should.be.fulfilled;
            await privateOfferingDistribution.setDistributionAddress(distributionAddress);
            await privateOfferingDistribution.addParticipants(privateOfferingParticipants, privateOfferingParticipantsStakes);
            await privateOfferingDistribution.finalizeParticipants();
        });
        it('should be initialized', async () => {
            const { logs } = await privateOfferingDistribution.initialize(accounts[9]).should.be.fulfilled;
            logs[0].args.token.should.be.equal(accounts[9]);
            logs[0].args.caller.should.be.equal(distributionAddress);
        });
        it('should fail if sender is not a distribution address', async () => {
            await privateOfferingDistribution.initialize(
                accounts[9],
                { from: accounts[8] }
            ).should.be.rejectedWith('wrong sender');
        });
        it('cannot be initialized twice', async () => {
            await privateOfferingDistribution.initialize(accounts[9]).should.be.fulfilled;
            await privateOfferingDistribution.initialize(accounts[9]).should.be.rejectedWith('already initialized');
        });
    });
    describe('setDistributionAddress', async () => {
        beforeEach(async () => {
            privateOfferingDistribution = await createPrivateOfferingDistribution();
            distributuon = await createDistribution(privateOfferingDistribution.address);
        });
        it('should be set', async () => {
            await privateOfferingDistribution.setDistributionAddress(distributuon.address).should.be.fulfilled;
        });
        it('cannot be set twice', async () => {
            await privateOfferingDistribution.setDistributionAddress(
                distributuon.address
            ).should.be.fulfilled;
            await privateOfferingDistribution.setDistributionAddress(
                distributuon.address
            ).should.be.rejectedWith('already set');
        });
        it('should fail if not an owner', async () => {
            await privateOfferingDistribution.setDistributionAddress(
                distributuon.address,
                { from: accounts[9] }
            ).should.be.rejectedWith('Ownable: caller is not the owner.');
        });
        it('should fail if not the Distribution contract address', async () => {
            await privateOfferingDistribution.setDistributionAddress(
                accounts[9]
            ).should.be.rejectedWith('revert');

            const contract = await EmptyContract.new();
            await privateOfferingDistribution.setDistributionAddress(
                contract.address
            ).should.be.rejectedWith('revert');

            const anotherPrivateOfferingDistribution = await createPrivateOfferingDistribution();
            const distribution = await createDistribution(anotherPrivateOfferingDistribution.address);
            await privateOfferingDistribution.setDistributionAddress(
                distribution.address
            ).should.be.rejectedWith('wrong address');
        });
    });
    describe('withdraw', () => {
        it('should be withdrawn', async () => {
            await prepare(privateOfferingParticipants, privateOfferingParticipantsStakes);
            const value = new BN(toWei('100'));
            await distribution.transferTokens(privateOfferingDistribution.address, value);
            const maxBalanceForCurrentEpoch = await privateOfferingDistribution.maxBalanceForCurrentEpoch();
            const balance = await token.balanceOf(privateOfferingDistribution.address);
            maxBalanceForCurrentEpoch.should.be.bignumber.equal(value);
            balance.should.be.bignumber.equal(value);
            const currentShare = value.mul(privateOfferingParticipantsStakes[0]).div(stake[PRIVATE_OFFERING]);
            const { logs } = await privateOfferingDistribution.withdraw({ from: privateOfferingParticipants[0] }).should.be.fulfilled;
            logs[0].args.recipient.should.be.equal(privateOfferingParticipants[0]);
            logs[0].args.value.should.be.bignumber.equal(currentShare);
            const participantBalance = await token.balanceOf(privateOfferingParticipants[0]);
            participantBalance.should.be.bignumber.equal(currentShare);
        });
        it('should be withdrawn 10 times by 20 participants', async () => {
            const participants = accounts.slice(10, 30);
            const participantsStakes = participants.map(() => new BN(toWei(String(random(1, 425000)))));
            await prepare(participants, participantsStakes);
            let sum = new BN(0);
            for (let i = 0; i < 10; i ++) {
                const value = new BN(toWei('100')).mul(new BN(i + 1));
                sum = sum.add(value);
                await distribution.transferTokens(privateOfferingDistribution.address, value);
                const maxBalanceForCurrentEpoch = await privateOfferingDistribution.maxBalanceForCurrentEpoch();
                maxBalanceForCurrentEpoch.should.be.bignumber.equal(sum);
                for (let j = 0; j < participants.length; j++) {
                    await withdraw(participants[j], participantsStakes[j]);
                }
            }
        });
        it('should be withdrawn in random order', async () => {
            const participants = [accounts[6], accounts[7], accounts[8], accounts[9]]
            const participantsStakes = [
                new BN(toWei('1650000')),
                new BN(toWei('3033000')),
                new BN(toWei('2220000')),
                new BN(toWei('1')),
            ];
            await prepare(participants, participantsStakes);

            await distribution.transferTokens(privateOfferingDistribution.address, new BN(toWei('100')));
            await withdraw(participants[0], participantsStakes[0]);
            await distribution.transferTokens(privateOfferingDistribution.address, new BN(toWei('300')));
            await withdraw(participants[1], participantsStakes[1]);
            await distribution.transferTokens(privateOfferingDistribution.address, new BN(toWei('500')));
            await withdraw(participants[2], participantsStakes[2]);
            await withdraw(participants[0], participantsStakes[0]);
            await withdraw(participants[1], participantsStakes[1]);
            await distribution.transferTokens(privateOfferingDistribution.address, new BN(toWei('1231')));
            await withdraw(participants[0], participantsStakes[0]);
            await distribution.transferTokens(privateOfferingDistribution.address, new BN(toWei('11')));
            await withdraw(participants[2], participantsStakes[2]);
            await withdraw(participants[1], participantsStakes[1]);
            await distribution.transferTokens(privateOfferingDistribution.address, new BN(toWei('2')));
            await withdraw(participants[3], participantsStakes[3]);
            await withdraw(participants[2], participantsStakes[2]);
            await withdraw(participants[1], participantsStakes[1]);
            await withdraw(participants[0], participantsStakes[0]);
        });
        it('cannot be withdrawn by not participant', async () => {
            const participants = [accounts[6], accounts[7]]
            const participantsStakes = [new BN(toWei('1650000')), new BN(toWei('3033000'))];
            await prepare(participants, participantsStakes);

            await distribution.transferTokens(privateOfferingDistribution.address, new BN(toWei('100')));
            await privateOfferingDistribution.withdraw({ from: accounts[8] }).should.be.rejectedWith('you are not a participant');
        });
        it('cannot be withdrawn when no tokens available', async () => {
            const participants = [accounts[6], accounts[7]]
            const participantsStakes = [new BN(toWei('1650000')), new BN(toWei('3033000'))];
            await prepare(participants, participantsStakes);

            const params = { from: accounts[6] };
            await privateOfferingDistribution.withdraw(params).should.be.rejectedWith('no tokens available to withdraw');
            await distribution.transferTokens(privateOfferingDistribution.address, new BN(toWei('100')));
            await privateOfferingDistribution.withdraw(params).should.be.fulfilled;
            await privateOfferingDistribution.withdraw(params).should.be.rejectedWith('no tokens available to withdraw');
        });
    });
    describe('burn', () => {
        it('should be burnt', async () => {
            const participants = [accounts[6], accounts[7], accounts[8], accounts[9]];
            const participantsStakes = [
                new BN(toWei('1650000')),
                new BN(toWei('3033000')),
                new BN(toWei('2220000')),
                new BN(toWei('1')),
            ];
            await prepare(participants, participantsStakes);
            const sumOfStakes = participantsStakes.reduce((acc, cur) => acc.add(cur), new BN(0));
            const zeroAddressStake = stake[PRIVATE_OFFERING].sub(sumOfStakes);
            const value = new BN(toWei('123321'));
            const currentShare = value.mul(zeroAddressStake).div(stake[PRIVATE_OFFERING]);
            await distribution.transferTokens(privateOfferingDistribution.address, value);
            const { logs } = await privateOfferingDistribution.burn().should.be.fulfilled;
            logs[0].args.value.should.be.bignumber.equal(currentShare);
            const balance = await token.balanceOf(EMPTY_ADDRESS);
            balance.should.be.bignumber.equal(currentShare);
        });
        it('should be burnt with after withdrawals', async () => {
            const participants = [accounts[6], accounts[7], accounts[8], accounts[9]]
            const participantsStakes = [
                new BN(toWei('1650000')),
                new BN(toWei('3033000')),
                new BN(toWei('2220000')),
                new BN(toWei('1')),
            ];
            await prepare(participants, participantsStakes);

            const sumOfStakes = participantsStakes.reduce((acc, cur) => acc.add(cur), new BN(0));
            const zeroAddressStake = stake[PRIVATE_OFFERING].sub(sumOfStakes);

            await distribution.transferTokens(privateOfferingDistribution.address, new BN(toWei('100')));
            await withdraw(participants[0], participantsStakes[0]);
            await distribution.transferTokens(privateOfferingDistribution.address, new BN(toWei('300')));
            await withdraw(participants[1], participantsStakes[1]);
            await distribution.transferTokens(privateOfferingDistribution.address, new BN(toWei('500')));
            await withdraw(participants[2], participantsStakes[2]);
            await burn(zeroAddressStake);
            await withdraw(participants[0], participantsStakes[0]);
            await withdraw(participants[1], participantsStakes[1]);
            await distribution.transferTokens(privateOfferingDistribution.address, new BN(toWei('1231')));
            await burn(zeroAddressStake);
            await withdraw(participants[0], participantsStakes[0]);
            await distribution.transferTokens(privateOfferingDistribution.address, new BN(toWei('11')));
            await withdraw(participants[2], participantsStakes[2]);
            await withdraw(participants[1], participantsStakes[1]);
            await distribution.transferTokens(privateOfferingDistribution.address, new BN(toWei('2')));
            await withdraw(participants[3], participantsStakes[3]);
            await withdraw(participants[2], participantsStakes[2]);
            await withdraw(participants[1], participantsStakes[1]);
            await withdraw(participants[0], participantsStakes[0]);
            await burn(zeroAddressStake);
        });
        it('cannot be burnt by not an owner', async () => {
            const participants = [accounts[6], accounts[7]];
            const participantsStakes = [new BN(toWei('1650000')), new BN(toWei('3033000'))];
            await prepare(participants, participantsStakes);
            await privateOfferingDistribution.burn({ from: accounts[1] }).should.be.rejectedWith('Ownable: caller is not the owner');
        });
        it('cannot be burnt if zero address stake is zero', async () => {
            const participants = [accounts[6], accounts[7]];
            const participantsStakes = [new BN(toWei('4000000')), new BN(toWei('4500000'))];
            await prepare(participants, participantsStakes);
            await distribution.transferTokens(privateOfferingDistribution.address, new BN(toWei('100')));
            await privateOfferingDistribution.burn().should.be.rejectedWith('you are not a participant');
        });
        it('cannot be burnt when no tokens available', async () => {
            const participants = [accounts[6], accounts[7]];
            const participantsStakes = [new BN(toWei('1650000')), new BN(toWei('3033000'))];
            await prepare(participants, participantsStakes);
            await distribution.transferTokens(privateOfferingDistribution.address, new BN(toWei('100')));
            await privateOfferingDistribution.burn().should.be.fulfilled;
            await privateOfferingDistribution.burn().should.be.rejectedWith('no tokens available to withdraw');
        });
    });
});
