
# PocketBase Data Transfer Tool

This script transfers data from one PocketBase instance to another for a specified collection. It first clears the target collection and then imports all records from the source collection.

## Features

- Transfers data between PocketBase instances
- Clears target collection before import
- Preserves all data fields (except PocketBase system fields)
- Authenticates as superuser for full access
- Provides detailed logging of the transfer process

## Prerequisites

- Node.js (v14 or higher)
- Two running PocketBase instances
- Superuser credentials for both instances

## Installation

1. Clone or download the script
2. Install dependencies:

```bash
npm install pocketbase dotenv
```

## Configuration

// Configure file fields (update to match your collection schema)
const fileFields = {
    'image': 'single',
    'additional_image': 'multiple',
};

Create a .env file in the same directory with the following variables:
.env


```
# Donor PocketBase (source)
DONOR_POCKETBASE_URL=http://127.0.0.1:8090
DONOR_SUPERUSER_EMAIL=admin@example.com
DONOR_SUPERUSER_PASSWORD=yourpassword

# Recipient PocketBase (destination)
RECIPIENT_POCKETBASE_URL=http://127.0.0.1:8091
RECIPIENT_SUPERUSER_EMAIL=admin@example.com
RECIPIENT_SUPERUSER_PASSWORD=yourpassword

# Collection to transfer (default: statuses)
COLLECTION_NAME=statuses
```

## Usage
Run the transfer script:

```bash
node transfer.js
```

## The script will:

Connect to both PocketBase instances

Fetch all records from the source collection

Delete all existing records in the target collection

Import all records to the target collection

Provide a summary of the transfer


Output Example
```
Starting data transfer for collection: statuses
From: http://127.0.0.1:8090
To: http://127.0.0.1:8091
Successfully authenticated with both PocketBase instances
Fetching records from donor collection: statuses
Found 8 records to transfer
Clearing recipient collection: statuses
Deleted 0 existing records from recipient
Starting record transfer...
Transferred record: w70dlnm3b3728iu
Transferred record: 001e4osik09q053
...
Transfer completed. Successfully transferred 8/8 records
```
## Important Notes
- The script will delete ALL existing records in the target collection before importing

- System fields (id, collectionId, collectionName, created, updated) are not preserved

- Ensure both PocketBase instances are running and accessible

- Verify you have proper superuser permissions on both instances

- Error Handling

## The script will:

- Exit with error if required environment variables are missing

- Log any record transfer failures but continue with remaining records

- Provide a final count of successful vs attempted transfers

## License
This script is provided as-is without warranty. Use at your own risk.