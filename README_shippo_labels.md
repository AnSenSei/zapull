# Shippo Label Creator - Local Script

This script creates Shippo shipping labels locally and exports the results to an Excel file.

## Setup

1. **Install dependencies:**
   ```bash
   pip install -r requirements_shippo.txt
   ```

2. **Configure your Shippo API key:**
   - Open `create_shippo_labels.py`
   - Replace `YOUR_SHIPPO_API_KEY_HERE` with your actual Shippo API key
   - You can get your API key from: https://goshippo.com/user/apikeys/

3. **Add your shipment data:**
   - Edit the `SAMPLE_SHIPMENTS` list in the script
   - Each shipment should include:
     - shipment_id, user_id
     - Recipient name, address details
     - List of cards with point_worth and quantity

## Usage

Run the script:
```bash
python create_shippo_labels.py
```

The script will:
1. Process each shipment in the list
2. Create shipping labels via Shippo API
3. Export results to `shippo_labels_output.xlsx`

## Excel Output

The Excel file includes these columns:
- Shipment ID & User ID
- Recipient information
- Total card value
- Shipping cost & carrier details
- Tracking number & URLs
- Status (Success/Failed)
- Timestamps

## Customization

You can modify:
- `SHIPPO_FROM_ADDRESS`: Your shipping origin address
- `CARD_PARCEL_DIMENSIONS`: Package dimensions
- `DEFAULT_INSURANCE_AMOUNT`: Insurance value
- `OUTPUT_FILE`: Output Excel filename

## Notes

- The script uses the cheapest available shipping rate
- Failed shipments will still be included in the Excel with error messages
- All shipments use the same parcel dimensions (suitable for cards)