import PocketBase from 'pocketbase';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configuration from environment variables
const config = {
    donor: {
        url: process.env.DONOR_POCKETBASE_URL,
        email: process.env.DONOR_SUPERUSER_EMAIL,
        password: process.env.DONOR_SUPERUSER_PASSWORD
    },
    recipient: {
        url: process.env.RECIPIENT_POCKETBASE_URL,
        email: process.env.RECIPIENT_SUPERUSER_EMAIL,
        password: process.env.RECIPIENT_SUPERUSER_PASSWORD
    },
    collectionName: process.env.COLLECTION_NAME || 'statuses'
};

async function transferData() {
    try {
        // Validate configuration
        if (!config.donor.url || !config.donor.email || !config.donor.password) {
            throw new Error('Missing donor PocketBase configuration');
        }
        if (!config.recipient.url || !config.recipient.email || !config.recipient.password) {
            throw new Error('Missing recipient PocketBase configuration');
        }

        console.log(`Starting data transfer for collection: ${config.collectionName}`);
        console.log(`From: ${config.donor.url}`);
        console.log(`To: ${config.recipient.url}`);

        // Initialize PocketBase clients
        const donorClient = new PocketBase(config.donor.url);
        const recipientClient = new PocketBase(config.recipient.url);

        // Authenticate as superuser for both instances
        await donorClient.admins.authWithPassword(config.donor.email, config.donor.password);
        await recipientClient.admins.authWithPassword(config.recipient.email, config.recipient.password);

        console.log('Successfully authenticated with both PocketBase instances');

        // Get all records from donor
        console.log(`Fetching records from donor collection: ${config.collectionName}`);
        const records = await donorClient.collection(config.collectionName).getFullList({
            sort: 'created'
        });

        if (records.length === 0) {
            console.log('No records found in donor collection');
            return;
        }

        console.log(`Found ${records.length} records to transfer`);

        // Clear recipient collection
        console.log(`Clearing recipient collection: ${config.collectionName}`);
        const existingRecords = await recipientClient.collection(config.collectionName).getFullList();

        for (const record of existingRecords) {
            await recipientClient.collection(config.collectionName).delete(record.id);
        }

        console.log(`Deleted ${existingRecords.length} existing records from recipient`);

        // Transfer records
        console.log('Starting record transfer...');
        let transferredCount = 0;
        let i = 0;
        for (const record of records) {
            i++;
            // Remove id and other PocketBase-specific fields that shouldn't be copied
            const { collectionId, collectionName, created, updated, ...data } = record;

            try {
                await recipientClient.collection(config.collectionName).create(data);
                transferredCount++;
                console.log(`Transferred record: ${i}`);
            } catch (error) {
                console.error(`Failed to transfer record ${i}:`, error.message);
            }
        }

        console.log(`Transfer completed. Successfully transferred ${transferredCount}/${records.length} records`);
    } catch (error) {
        console.error('Error during data transfer:', error.message);
        process.exit(1);
    }
}

transferData();