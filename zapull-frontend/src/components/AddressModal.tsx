'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import { getCountries, getStatesByCountry, getCitiesByState } from '@/lib/addressUtils'
import { ICountry, IState, ICity } from 'country-state-city/lib/interface'
import AddressSuggestionModal from './AddressSuggestionModal'

interface AddressData {
  id?: number | string
  name: string
  street: string
  city: string
  cityName?: string // For internal processing, won't be sent to API
  state: string
  stateName?: string // For internal processing, won't be sent to API
  zip: string
  country: string
  countryCode?: string // For internal processing, won't be sent to API
  stateCode?: string // For internal processing, won't be sent to API
}

interface AddressModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: AddressData, skipValidation?: boolean) => Promise<void>
  address?: AddressData
  title?: string
}

const defaultAddress: AddressData = {
  name: '',
  street: '',
  city: '',
  cityName: '',
  state: '',
  stateName: '',
  zip: '',
  country: 'United States',
  countryCode: 'US',
  stateCode: ''
}

export default function AddressModal({ isOpen, onClose, onSave, address, title = 'EDIT THE ADDRESS' }: AddressModalProps) {
  const [formData, setFormData] = useState<AddressData>(defaultAddress)
  const [loading, setLoading] = useState(false)
  const [countries, setCountries] = useState<ICountry[]>([])
  const [states, setStates] = useState<IState[]>([])
  const [cities, setCities] = useState<ICity[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [showSuggestion, setShowSuggestion] = useState(false)
  const [suggestedAddress, setSuggestedAddress] = useState<AddressData | null>(null)

  // Supported countries based on shipping zones
  const SUPPORTED_COUNTRY_CODES = ['US', 'CA', 'GB', 'MX', 'DE', 'FR', 'AU', 'IT'];

  // Initialize country list
  useEffect(() => {
    try {
      const allCountries = getCountries();
      // Filter to only show supported countries
      const supportedCountries = allCountries.filter(country => 
        SUPPORTED_COUNTRY_CODES.includes(country.isoCode)
      );
      setCountries(supportedCountries);
    } catch (error) {
      console.error('Failed to load countries:', error);
      setErrors(prev => ({ ...prev, countries: 'Failed to load countries' }));
    }
  }, [])

  // Update states/provinces when country changes
  const updateStates = useCallback((countryCode: string) => {
    try {
      const statesList = getStatesByCountry(countryCode);
      setStates(statesList);
      return statesList;
    } catch (error) {
      console.error('Failed to load states:', error);
      setStates([]);
      setErrors(prev => ({ ...prev, states: 'Failed to load states' }));
      return [];
    }
  }, []);

  // Update cities when state/province changes
  const updateCities = useCallback((countryCode: string, stateCode: string) => {
    try {
      const citiesList = getCitiesByState(countryCode, stateCode);
      setCities(citiesList);
      return citiesList;
    } catch (error) {
      console.error('Failed to load cities:', error);
      setCities([]);
      setErrors(prev => ({ ...prev, cities: 'Failed to load cities' }));
      return [];
    }
  }, []);

  // Handle country change
  useEffect(() => {
    if (formData.countryCode) {
      const statesList = updateStates(formData.countryCode);
      
      // If current state/province is not in new list, reset state and city
      if (formData.stateCode && !statesList.some(s => s.isoCode === formData.stateCode)) {
        setFormData(prev => ({ 
          ...prev, 
          state: '', 
          stateName: '',
          stateCode: '', 
          city: '',
          cityName: ''
        }));
        setCities([]);
      }
    }
  }, [formData.countryCode, updateStates])

  // Handle state/province change
  useEffect(() => {
    if (formData.countryCode && formData.stateCode) {
      const citiesList = updateCities(formData.countryCode, formData.stateCode);
      
      // If current city is not in new list, reset city
      if (formData.city && !citiesList.some(c => c.name === formData.city)) {
        setFormData(prev => ({ ...prev, city: '', cityName: '' }));
      }
    }
  }, [formData.countryCode, formData.stateCode, updateCities])

  // Initialize or reset form data
  useEffect(() => {
    if (isOpen) {
      // Reset loading and error states when modal opens
      setLoading(false);
      setErrors({});
      setShowSuggestion(false);
      setSuggestedAddress(null);
      
      if (address) {
        // If editing existing address, ensure countryCode and stateCode exist
        const initializeAddress = () => {
          let updatedAddress = { ...address };
          
          // Always ensure we have a countryCode
          if (!address.countryCode && address.country) {
            // Try to find country by name match
            const country = countries.find(c => 
              c.name === address.country || 
              c.isoCode === address.country
            );
            
            if (country) {
              updatedAddress.countryCode = country.isoCode;
              updatedAddress.country = country.name;
            } else {
              // Default to US if country not found
              updatedAddress.countryCode = 'US';
              updatedAddress.country = 'United States';
            }
          } else if (address.countryCode) {
            // Ensure we have the country name too
            const country = countries.find(c => c.isoCode === address.countryCode);
            if (country) {
              updatedAddress.country = country.name;
            }
          } else {
            // No country info at all, default to US
            updatedAddress.countryCode = 'US';
            updatedAddress.country = 'United States';
          }
          
          // Load states for the country
          if (updatedAddress.countryCode) {
            const statesList = updateStates(updatedAddress.countryCode);
            
            // Find state/province code if we don't have it
            if (!updatedAddress.stateCode && updatedAddress.state) {
              const state = statesList.find(s => s.name === updatedAddress.state);
              if (state) {
                updatedAddress.stateCode = state.isoCode;
                updatedAddress.stateName = state.name;
              }
            }
            
            // Load cities if we have state code
            if (updatedAddress.countryCode && updatedAddress.stateCode) {
              updateCities(updatedAddress.countryCode, updatedAddress.stateCode);
            }
          }
          
          setFormData(updatedAddress);
        };
        
        // Only initialize if countries are loaded
        if (countries.length > 0) {
          initializeAddress();
        }
      } else {
        setFormData(defaultAddress);
        // Load US states for the default country
        if (defaultAddress.countryCode) {
          updateStates(defaultAddress.countryCode);
        }
        setCities([]);
      }
    }
  }, [address, isOpen, countries.length]) // Removed updateStates and updateCities from deps to avoid infinite loop

  // Re-initialize when countries are loaded if we're editing and don't have countryCode yet
  useEffect(() => {
    if (isOpen && address && countries.length > 0 && !formData.countryCode && formData.country) {
      // Try to set countryCode from country name
      const country = countries.find(c => 
        c.name === formData.country || 
        c.isoCode === formData.country
      );
      
      if (country) {
        setFormData(prev => ({
          ...prev,
          countryCode: country.isoCode,
          country: country.name
        }));
        
        // Load states for this country
        updateStates(country.isoCode);
      }
    }
  }, [countries.length, isOpen, address, formData.country, formData.countryCode, updateStates]);

  // Clear error messages
  const clearError = (field: string) => {
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[field];
      return newErrors;
    });
  };

  // Postal/ZIP validation by country
  const isValidPostalForCountry = (countryCode: string | undefined, postal: string): boolean => {
    if (!postal) return false;
    if (!countryCode) return /^[A-Za-z0-9][A-Za-z0-9\s-]{1,15}$/.test(postal.trim());

    const map: Record<string, RegExp> = {
      US: /^\d{5}(-\d{4})?$/, // 12345 or 12345-6789
      CA: /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/, // A1A 1A1
      GB: /^(GIR 0AA|[A-Z]{1,2}\d[A-Z\d]? \d[ABD-HJLN-UW-Z]{2})$/i, // simplified UK
      AU: /^\d{4}$/,
      DE: /^\d{5}$/,
      FR: /^\d{5}$/,
      IT: /^\d{5}$/,
      MX: /^\d{5}$/
    };

    const regex = map[countryCode.toUpperCase()];
    if (regex) return regex.test(postal.trim());

    // Generic fallback: 2-15 chars alphanumeric with spaces or dashes
    return /^[A-Za-z0-9][A-Za-z0-9\s-]{1,15}$/.test(postal.trim());
  };

  // Form validation
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }
    
    if (!formData.street.trim()) {
      newErrors.street = 'Street address is required';
    }
    
    if (!formData.countryCode) {
      newErrors.countryCode = 'Please select a country';
    }
    
    if (!formData.state || !formData.state.trim()) {
      newErrors.state = 'State/Province is required';
    }
    
    if (!formData.city.trim()) {
      newErrors.city = 'City is required';
    }
    
    if (!formData.zip.trim()) {
      newErrors.zip = formData.countryCode === 'US' ? 'ZIP code is required' : 'Postal code is required';
    } else if (!isValidPostalForCountry(formData.countryCode, formData.zip)) {
      newErrors.zip = formData.countryCode === 'US' ? 'Please enter a valid ZIP code (e.g., 12345 or 12345-6789)' : 'Please enter a valid postal code for the selected country';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    // Clear field error
    clearError(name);
    
    // Handle special field changes
    if (name === 'countryCode') {
      const selectedCountry = countries.find(c => c.isoCode === value);
      if (selectedCountry) {
        setFormData(prev => ({
          ...prev,
          countryCode: value,
          country: selectedCountry.name,
          state: '',
          stateName: '',
          stateCode: '',
          city: '',
          cityName: ''
        }));
      }
    } else if (name === 'city') {
      const selectedCity = cities.find(c => c.name === value);
      setFormData(prev => ({
        ...prev,
        city: value,
        cityName: selectedCity ? selectedCity.name : value
      }));
    } else {
      // Handle other regular fields
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return;
    }
    
    setLoading(true)
    
    try {
      // First try to save without skipping validation
      await onSave(formData, false)
      setLoading(false)
      onClose()
    } catch (error: any) {
      console.error('Error saving address:', error)
      
      // Check if error contains suggested address from backend (Shippo validation)
      if (error.response?.data?.detail?.suggested_address) {
        const suggested = error.response.data.detail.suggested_address;
        
        // Map the suggested address to our format
        const suggestedAddr: AddressData = {
          ...formData,
          name: suggested.name || formData.name,
          street: suggested.street || formData.street,
          city: suggested.city || formData.city,
          state: suggested.state || formData.state,
          zip: suggested.zip || formData.zip,
          country: suggested.country || formData.country
        };
        
        setSuggestedAddress(suggestedAddr);
        setShowSuggestion(true);
        setLoading(false);
        return;
      }
      
      // Handle other errors
      const errorMessage = error.response?.data?.detail?.error || 
                          error.response?.data?.detail || 
                          error.message || 
                          'Failed to save, please try again';
      
      setErrors(prev => ({ ...prev, submit: errorMessage }));
      setLoading(false);
    }
  }
  
  const handleAcceptSuggestion = async () => {
    if (suggestedAddress) {
      // Update form with suggested address
      setFormData(suggestedAddress);
      setShowSuggestion(false);
      
      // Save with the suggested address (no need to skip validation)
      setLoading(true);
      try {
        await onSave(suggestedAddress, false);
        setLoading(false);
        onClose();
      } catch (error: any) {
        console.error('Error saving suggested address:', error);
        const errorMessage = error.response?.data?.detail || error.message || 'Failed to save, please try again';
        setErrors(prev => ({ ...prev, submit: errorMessage }));
        setLoading(false);
      } finally {
        setSuggestedAddress(null);
      }
    }
  };
  
  const handleRejectSuggestion = async () => {
    // User chose to keep original address - save with skip_validation=true
    setShowSuggestion(false);
    
    setLoading(true);
    try {
      await onSave(formData, true); // Skip validation
      setLoading(false);
      onClose();
    } catch (error: any) {
      console.error('Error saving original address:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to save, please try again';
      setErrors(prev => ({ ...prev, submit: errorMessage }));
      setLoading(false);
    } finally {
      setSuggestedAddress(null);
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md"
        style={{
          background: 'linear-gradient(0deg, #0F111C 0%, #1F2235 99%)',
          borderRadius: '20px',
          border: '2px solid #8B5CF6'
        }}
      >
        <div className="p-6">
        {/* Close button */}
        <button 
          onClick={onClose}
          className="absolute -top-2 -right-2 text-white hover:text-gray-300 transition-colors z-10"
        >
          <Image src="/icons/close.png" alt="Close" width={24} height={24} />
        </button>

        {/* Title */}
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold text-white uppercase">{title}</h2>
          <div className="flex justify-center mt-2">
            <div className="w-12 h-1 bg-[#8B5CF6] rounded-full"></div>
          </div>
        </div>

        {/* Global error message */}
        {errors.submit && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-400 text-sm">
            {errors.submit}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className={`w-full px-4 py-3 bg-[#2A2B3D] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] text-white text-sm ${errors.name ? 'border border-red-500' : ''}`}
              placeholder="Name"
            />
            {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name}</p>}
          </div>
          
          {/* Country */}
          <div>
            <select
              id="countryCode"
              name="countryCode"
              value={formData.countryCode}
              onChange={handleChange}
              className={`w-full px-4 py-3 bg-[#2A2B3D] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] text-white text-sm appearance-none ${errors.countryCode ? 'border border-red-500' : ''}`}
            >
              <option value="">Select Country</option>
              {countries.map(country => (
                <option key={country.isoCode} value={country.isoCode}>
                  {country.name} ({country.isoCode})
                </option>
              ))}
            </select>
            {errors.countryCode && <p className="text-red-400 text-xs mt-1">{errors.countryCode}</p>}
            {errors.countries && <p className="text-red-400 text-xs mt-1">{errors.countries}</p>}
          </div>
          
          {/* State/Province */}
          <div>
            <input
              type="text"
              id="state"
              name="state"
              value={formData.state}
              onChange={handleChange}
              className={`w-full px-4 py-3 bg-[#2A2B3D] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] text-white text-sm ${errors.state ? 'border border-red-500' : ''}`}
              placeholder="State/Province"
            />
            {errors.state && <p className="text-red-400 text-xs mt-1">{errors.state}</p>}
          </div>
          
          {/* City */}
          <div>
            <input
              type="text"
              id="city"
              name="city"
              value={formData.city}
              onChange={handleChange}
              className={`w-full px-4 py-3 bg-[#2A2B3D] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] text-white text-sm ${errors.city ? 'border border-red-500' : ''}`}
              placeholder="City"
            />
            {errors.city && <p className="text-red-400 text-xs mt-1">{errors.city}</p>}
          </div>
          
          {/* Street Address */}
          <div>
            <input
              type="text"
              id="street"
              name="street"
              value={formData.street}
              onChange={handleChange}
              className={`w-full px-4 py-3 bg-[#2A2B3D] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] text-white text-sm ${errors.street ? 'border border-red-500' : ''}`}
              placeholder="Street Address"
            />
            {errors.street && <p className="text-red-400 text-xs mt-1">{errors.street}</p>}
          </div>
          
          {/* Postal/ZIP Code */}
          <div>
            <input
              type="text"
              id="zip"
              name="zip"
              value={formData.zip}
              onChange={handleChange}
              className={`w-full px-4 py-3 bg-[#2A2B3D] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] text-white text-sm ${errors.zip ? 'border border-red-500' : ''}`}
              placeholder={formData.countryCode === 'US' ? 'ZIP Code' : 'Postal Code'}
            />
            {errors.zip && <p className="text-red-400 text-xs mt-1">{errors.zip}</p>}
          </div>
          
          {/* Buttons */}
          <div className="grid grid-cols-2 gap-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="w-full bg-transparent border border-[#8B5CF6] text-white py-3 rounded-lg font-medium transition-colors hover:bg-[#8B5CF6]/20 flex items-center justify-center"
            >
              <Image src="/icons/close.png" alt="Close" width={16} height={16} />
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#8B5CF6] hover:bg-[#7C3AED] text-white py-3 rounded-lg font-medium transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center"
            >
              <span className="mr-2">💾</span> {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
        </div>
      </motion.div>
      
      {/* Address Suggestion Modal */}
      {suggestedAddress && (
        <AddressSuggestionModal
          isOpen={showSuggestion}
          onClose={() => setShowSuggestion(false)}
          onAccept={handleAcceptSuggestion}
          onReject={handleRejectSuggestion}
          originalAddress={formData}
          suggestedAddress={suggestedAddress}
        />
      )}
    </div>
  )
}