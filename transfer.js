import PocketBase from 'pocketbase';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fetch from 'node-fetch';
import FormData from 'form-data';

// Load environment variables
dotenv.config();

// Configuration from environment variables
const config = {
    donor: {
        url: process.env.DONOR_POCKETBASE_URL,
        email: process.env.DONOR_SUPERUSER_EMAIL,
        password: process.env.DONOR_SUPERUSER_PASSWORD,
    },
    recipient: {
        url: process.env.RECIPIENT_POCKETBASE_URL,
        email: process.env.RECIPIENT_SUPERUSER_EMAIL,
        password: process.env.RECIPIENT_SUPERUSER_PASSWORD,
    },
    collectionName: process.env.COLLECTION_NAME || 'products',
    tempDir: process.env.TEMP_DIR || './temp_files',
    batchSize: process.env.BATCH_SIZE ? parseInt(process.env.BATCH_SIZE) : 10,
    timeout: process.env.TIMEOUT ? parseInt(process.env.TIMEOUT) : 30000,
};

// Create __dirname in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create temp directory if it doesn't exist
const tempDir = path.join(__dirname, config.tempDir);
console.log(`[INIT] Temporary directory set to: ${tempDir}`);

try {
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
        console.log(`[INIT] Created temporary directory`);
    } else {
        console.log(`[INIT] Temporary directory already exists`);
    }

    // Test directory writability
    const testFile = path.join(tempDir, 'write_test.txt');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    console.log(`[INIT] Verified directory is writable`);
} catch (err) {
    console.error(`[INIT ERROR] Failed to setup temp directory:`, err);
    process.exit(1);
}

// Configure file fields (update to match your collection schema)
const fileFields = {
    'image': 'single',
    'additional_image': 'multiple',
};

/**
 * Sanitize filenames to avoid invalid characters
 */
function sanitizeFilename(filename) {
    return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Enhanced file download with comprehensive debugging
 */
async function downloadFile(client, collectionName, recordId, filename) {
    const startTime = Date.now();
    console.log(`[DOWNLOAD START] ${filename} from record ${recordId}`);

    try {
        // Verify client authentication
        if (!client.authStore.isValid) {
            throw new Error('Client authentication is invalid');
        }

        // Construct file URL
        const fileUrl = client.files.getUrl({ collectionName, id: recordId }, filename);
        console.log(`[DOWNLOAD DEBUG] Constructed URL: ${fileUrl}`);
        console.log(`[DOWNLOAD DEBUG] Auth token present: ${!!client.authStore.token}`);

        // Debug the full request
        console.log(`[DOWNLOAD DEBUG] Making request to: ${fileUrl}`);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), config.timeout);

        const response = await fetch(fileUrl, {
            signal: controller.signal,
            headers: {
                'Authorization': `Bearer ${client.authStore.token}`,
            },
        });
        clearTimeout(timeout);

        console.log(`[DOWNLOAD DEBUG] Response status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`[DOWNLOAD DEBUG] Error response:`, errorBody);
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Check content information
        const contentLength = response.headers.get('content-length');
        const contentType = response.headers.get('content-type');
        console.log(`[DOWNLOAD DEBUG] Content-Type: ${contentType}, Length: ${contentLength || 'unknown'} bytes`);

        const fileData = await response.arrayBuffer();
        console.log(`[DOWNLOAD DEBUG] Received data: ${fileData.byteLength} bytes`);

        if (fileData.byteLength === 0) {
            throw new Error('Received empty file data');
        }

        const safeFilename = sanitizeFilename(filename);
        const filePath = path.join(tempDir, safeFilename);

        // Ensure directory exists
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        fs.writeFileSync(filePath, Buffer.from(fileData));
        console.log(`[DOWNLOAD DEBUG] Saved to: ${filePath}`);

        // Verify file was written
        const stats = fs.statSync(filePath);
        console.log(`[DOWNLOAD DEBUG] File saved successfully: ${stats.size} bytes`);

        const duration = Date.now() - startTime;
        console.log(`[DOWNLOAD SUCCESS] ${filename} in ${duration}ms`);
        return filePath;
    } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`[DOWNLOAD FAILED] ${filename} after ${duration}ms:`, error.message);
        console.error(`[DOWNLOAD ERROR DETAILS]`, error);
        return null;
    }
}

/**
 * Upload files to PocketBase using form-data
 */
// async function uploadFiles(client, collectionName, recordId, fieldName, files) {
//     console.log(`[UPLOAD START] ${fieldName} for record ${recordId}`);

//     try {
//         const formData = new FormData();

//         if (Array.isArray(files)) {
//             console.log(`[UPLOAD DEBUG] Processing multiple files (${files.length})`);
//             for (const filePath of files) {
//                 if (!fs.existsSync(filePath)) {
//                     console.error(`[UPLOAD ERROR] File not found: ${filePath}`);
//                     continue;
//                 }
//                 const filename = path.basename(filePath);
//                 const fileStream = fs.createReadStream(filePath);
//                 formData.append(fieldName, fileStream, filename);
//                 console.log(`[UPLOAD DEBUG] Added file: ${filename}`);
//             }
//         } else {
//             console.log(`[UPLOAD DEBUG] Processing single file`);
//             if (!fs.existsSync(files)) {
//                 throw new Error(`File not found: ${files}`);
//             }
//             const filename = path.basename(files);
//             const fileStream = fs.createReadStream(files);
//             formData.append(fieldName, fileStream, filename);
//             console.log(`[UPLOAD DEBUG] Added file: ${filename}`);
//         }

//         const headers = formData.getHeaders();
//         headers['Authorization'] = `Bearer ${client.authStore.token}`;

//         console.log(`[UPLOAD DEBUG] Sending PATCH request`);
//         const result = await client.send(`/api/collections/${collectionName}/records/${recordId}`, {
//             method: 'PATCH',
//             headers,
//             body: formData,
//         });

//         console.log(`[UPLOAD SUCCESS] ${fieldName} for record ${recordId}`);
//         return result;
//     } catch (error) {
//         console.error(`[UPLOAD FAILED] ${fieldName} for record ${recordId}:`, error.message);
//         throw error;
//     }
// }
async function uploadFiles(client, collectionName, recordId, fieldName, files) {
    console.log(`[UPLOAD START] ${fieldName} for record ${recordId}`);

    try {
        // Verify client authentication
        if (!client.authStore.isValid) {
            await client.admins.authWithPassword(config.recipient.email, config.recipient.password);
        }

        const formData = new FormData();
        const isMultiple = Array.isArray(files);

        // Add the files to formData
        if (isMultiple) {
            console.log(`[UPLOAD DEBUG] Processing multiple files (${files.length})`);
            for (const filePath of files) {
                if (!fs.existsSync(filePath)) {
                    console.error(`[UPLOAD ERROR] File not found: ${filePath}`);
                    continue;
                }
                const fileStream = fs.createReadStream(filePath);
                const filename = path.basename(filePath);
                formData.append(fieldName, fileStream, filename);
                console.log(`[UPLOAD DEBUG] Added file: ${filename}`);
            }
        } else {
            console.log(`[UPLOAD DEBUG] Processing single file`);
            if (!fs.existsSync(files)) {
                throw new Error(`File not found: ${files}`);
            }
            const fileStream = fs.createReadStream(files);
            const filename = path.basename(files);
            formData.append(fieldName, fileStream, filename);
            console.log(`[UPLOAD DEBUG] Added file: ${filename}`);
        }

        // Prepare headers
        const headers = formData.getHeaders();
        headers['Authorization'] = `Bearer ${client.authStore.token}`;

        // Debug the request
        console.log(`[UPLOAD DEBUG] Sending PATCH to ${client.baseUrl}/api/collections/${collectionName}/records/${recordId}`);
        console.log(`[UPLOAD DEBUG] Headers:`, headers);

        // Make the request
        const response = await fetch(`${client.baseUrl}/api/collections/${collectionName}/records/${recordId}`, {
            method: 'PATCH',
            headers: headers,
            body: formData,
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`[UPLOAD ERROR] Server response: ${response.status} ${response.statusText}`);
            console.error(`[UPLOAD ERROR] Response body:`, errorBody);
            throw new Error(`Upload failed with status ${response.status}: ${errorBody}`);
        }

        const result = await response.json();
        console.log(`[UPLOAD SUCCESS] ${fieldName} for record ${recordId}`);
        return result;
    } catch (error) {
        console.error(`[UPLOAD FAILED] ${fieldName} for record ${recordId}:`, error.message);
        if (error.response) {
            console.error(`[UPLOAD ERROR DETAILS]`, error.response.data);
        }
        throw error;
    }
}

/**
 * Clear all records from the recipient collection
 */
async function clearRecipientCollection(client) {
    try {
        console.log(`[CLEANUP] Starting to clear recipient collection`);
        const existingRecords = await client.collection(config.collectionName).getFullList();
        console.log(`[CLEANUP] Found ${existingRecords.length} records to delete`);

        for (const record of existingRecords) {
            try {
                await client.collection(config.collectionName).delete(record.id);
                console.log(`[CLEANUP] Deleted record ${record.id}`);
            } catch (error) {
                console.error(`[CLEANUP ERROR] Failed to delete record ${record.id}:`, error.message);
            }
        }
        console.log(`[CLEANUP] Completed clearing recipient collection`);
    } catch (error) {
        console.error('[CLEANUP ERROR] Failed to clear recipient collection:', error.message);
        throw error;
    }
}

/**
 * Main data transfer function
 */
async function transferData() {
    let donorClient;
    let recipientClient;
    let transferredCount = 0;
    let failedCount = 0;

    console.log('[TRANSFER] Starting data transfer process');

    try {
        // Validate configuration
        console.log('[CONFIG] Validating configuration');
        if (!config.donor.url || !config.donor.email || !config.donor.password) {
            throw new Error('Missing donor PocketBase configuration');
        }
        if (!config.recipient.url || !config.recipient.email || !config.recipient.password) {
            throw new Error('Missing recipient PocketBase configuration');
        }

        console.log(`[TRANSFER] Collection: ${config.collectionName}`);
        console.log(`[TRANSFER] Donor: ${config.donor.url}`);
        console.log(`[TRANSFER] Recipient: ${config.recipient.url}`);

        // Initialize PocketBase clients
        console.log('[CLIENT] Initializing PocketBase clients');
        donorClient = new PocketBase(config.donor.url);
        recipientClient = new PocketBase(config.recipient.url);

        // Authenticate as superuser
        console.log('[AUTH] Authenticating with donor');
        await donorClient.admins.authWithPassword(config.donor.email, config.donor.password);
        console.log('[AUTH] Authenticating with recipient');
        await recipientClient.admins.authWithPassword(config.recipient.email, config.recipient.password);
        console.log('[AUTH] Authentication successful');

        // Clear recipient collection
        await clearRecipientCollection(recipientClient);

        // Get all records from donor
        console.log('[FETCH] Retrieving records from donor');
        const records = await donorClient.collection(config.collectionName).getFullList({
            sort: 'created',
            batch: config.batchSize,
        });

        if (records.length === 0) {
            console.log('[FETCH] No records found in donor collection');
            return;
        }

        console.log(`[FETCH] Found ${records.length} records to transfer`);

        // Transfer records in batches
        for (let i = 0; i < records.length; i += config.batchSize) {
            const batch = records.slice(i, i + config.batchSize);
            console.log(`[BATCH] Processing batch ${Math.floor(i / config.batchSize) + 1} (records ${i + 1}-${Math.min(i + config.batchSize, records.length)})`);

            for (const record of batch) {
                console.log(`[RECORD] Processing record ${record.id}`);
                try {
                    const { collectionId, collectionName, created, updated, expand, additional_image, image, ...data } = record;

                    // Create new record on recipient
                    console.log(`[RECORD] Creating record in recipient`);
                    const newRecord = await recipientClient.collection(config.collectionName).create(data);
                    console.log(`[RECORD] Created new record ${newRecord.id}`);

                    // Process each file field
                    for (const [field, type] of Object.entries(fileFields)) {
                        if (record[field]) {
                            console.log(`[FILE FIELD] Processing ${field} (${type})`);
                            try {
                                if (type === 'multiple' && Array.isArray(record[field])) {
                                    console.log(`[FILE FIELD] Processing multiple files (${record[field].length})`);
                                    const filePaths = [];
                                    for (const filename of record[field]) {
                                        console.log(`[FILE DOWNLOAD] Starting download for ${filename}`);
                                        const filePath = await downloadFile(
                                            donorClient,
                                            config.collectionName,
                                            record.id,
                                            filename
                                        );
                                        if (filePath) {
                                            console.log(`[FILE DOWNLOAD] Successfully downloaded to ${filePath}`);
                                            filePaths.push(filePath);
                                        } else {
                                            console.error(`[FILE DOWNLOAD] Failed to download ${filename}`);
                                        }
                                    }

                                    if (filePaths.length > 0) {
                                        console.log(`[FILE UPLOAD] Starting upload of ${filePaths.length} files`);
                                        await uploadFiles(
                                            recipientClient,
                                            config.collectionName,
                                            newRecord.id,
                                            field,
                                            filePaths
                                        );
                                        console.log(`[FILE UPLOAD] Completed upload`);
                                    }

                                    // Cleanup temp files
                                    filePaths.forEach(filePath => {
                                        try {
                                            if (fs.existsSync(filePath)) {
                                                fs.unlinkSync(filePath);
                                                console.log(`[CLEANUP] Removed temp file ${filePath}`);
                                            }
                                        } catch (err) {
                                            console.error(`[CLEANUP ERROR] Failed to remove ${filePath}:`, err.message);
                                        }
                                    });
                                } else if (type === 'single') {
                                    const filename = record[field];
                                    console.log(`[FILE DOWNLOAD] Starting single file download for ${filename}`);
                                    const filePath = await downloadFile(
                                        donorClient,
                                        config.collectionName,
                                        record.id,
                                        filename
                                    );

                                    if (filePath) {
                                        console.log(`[FILE UPLOAD] Starting single file upload`);
                                        await uploadFiles(
                                            recipientClient,
                                            config.collectionName,
                                            newRecord.id,
                                            field,
                                            filePath
                                        );
                                        console.log(`[FILE UPLOAD] Completed upload`);

                                        try {
                                            if (fs.existsSync(filePath)) {
                                                fs.unlinkSync(filePath);
                                                console.log(`[CLEANUP] Removed temp file ${filePath}`);
                                            }
                                        } catch (err) {
                                            console.error(`[CLEANUP ERROR] Failed to remove ${filePath}:`, err.message);
                                        }
                                    }
                                }
                            } catch (error) {
                                console.error(`[FILE PROCESSING ERROR] Field ${field} for record ${record.id}:`, error.message);
                            }
                        }
                    }

                    transferredCount++;
                    console.log(`[SUCCESS] Transferred record ${record.id} (${transferredCount}/${records.length})`);
                } catch (error) {
                    failedCount++;
                    console.error(`[FAILURE] Record ${record.id} failed:`, error.message);
                    console.error(`[ERROR DETAILS]`, error);
                }
            }
        }

        console.log('\n[TRANSFER COMPLETE] Summary:');
        console.log(`- Successfully transferred: ${transferredCount}`);
        console.log(`- Failed transfers: ${failedCount}`);
        console.log(`- Total records processed: ${records.length}`);
    } catch (error) {
        console.error('[FATAL ERROR] Data transfer failed:', error.message);
        console.error('[FATAL ERROR DETAILS]', error);
        process.exit(1);
    } finally {
        // Clean up temp directory
        try {
            // console.log('[CLEANUP] Starting final cleanup');
            // const files = fs.readdirSync(tempDir);
            // if (files.length > 0) {
            //     console.log(`[CLEANUP] Found ${files.length} files in temp directory`);
            //     for (const file of files) {
            //         const filePath = path.join(tempDir, file);
            //         fs.unlinkSync(filePath);
            //     }
            // }
            // console.log('[CLEANUP] Completed final cleanup');
        } catch (error) {
            console.error('[CLEANUP ERROR] Failed to clean temp directory:', error.message);
        }
    }
}

// Start the transfer
transferData();