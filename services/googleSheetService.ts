
import { type UserData } from '../types';

const SHEET_ID = '1ownFgqzmgnv_LcX4RLXTdGpwx5ylegJDwCb1s6Y195E';
const GID = '0';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;

// Simple CSV parser
const parseCSV = (csvText: string): string[][] => {
    return csvText.split('\n').map(row => 
        row.split(',').map(cell => cell.trim().replace(/^"|"$/g, ''))
    );
};

export const fetchUsers = async (): Promise<UserData[]> => {
    try {
        const response = await fetch(CSV_URL);
        if (!response.ok) {
            throw new Error('Failed to fetch Google Sheet data.');
        }
        const csvText = await response.text();
        const rows = parseCSV(csvText);
        
        // Remove header row
        const dataRows = rows.slice(1);

        return dataRows.map(row => ({
            code: row[0] || '',
            visible: (row[1] || '').toUpperCase() === 'TRUE',
            link: row[2] || '',
            unlockCode: row[3] || ''
        })).filter(user => user.code); // Filter out empty rows
    } catch (error) {
        console.error("Error fetching or parsing sheet data:", error);
        return [];
    }
};
