"""
Custom multipart parser with configurable file size limits.
This bypasses Starlette's default 1MB SpooledTemporaryFile limitation.
"""

import tempfile
from typing import AsyncGenerator, Tuple
from starlette.datastructures import UploadFile, Headers
from starlette.formparsers import MultiPartParser as StarletteMultiPartParser
from starlette.formparsers import _user_safe_decode


class CustomMultiPartParser:
    """
    Custom multipart parser that allows configurable max_size for temporary files.
    """
    
    def __init__(self, headers: Headers, stream: AsyncGenerator[bytes, None], max_files: int = 1000, max_fields: int = 1000, max_size: int = int(2.5 * 1024 * 1024)):
        self.headers = headers
        self.stream = stream  
        self.max_files = max_files
        self.max_fields = max_fields
        self.max_size = max_size
        
    async def parse(self):
        """
        Parse multipart form data with custom temp file size limits.
        """
        # Get boundary from content-type header
        content_type = self.headers.get('content-type', '')
        if 'boundary=' not in content_type:
            return {}, {}
            
        boundary = content_type.split('boundary=')[1].split(';')[0].strip('"')
        boundary_bytes = ('--' + boundary).encode()
        
        form_data = {}
        files = {}
        field_count = 0
        file_count = 0
        
        current_part = None
        current_headers = {}
        current_data = b''
        in_headers = False
        
        async for chunk in self.stream:
            lines = chunk.split(b'\r\n')
            
            for line in lines:
                if line == boundary_bytes:
                    # Process previous part if exists
                    if current_part:
                        await self._process_part(current_part, current_headers, current_data, form_data, files)
                        field_count += 1
                        if field_count > self.max_fields:
                            raise ValueError("Too many form fields")
                    
                    # Start new part
                    current_part = True
                    current_headers = {}
                    current_data = b''
                    in_headers = True
                    
                elif line == (boundary_bytes + b'--'):
                    # End of multipart data
                    if current_part:
                        await self._process_part(current_part, current_headers, current_data, form_data, files)
                    break
                    
                elif in_headers:
                    if line == b'':
                        # End of headers, start of data
                        in_headers = False
                    else:
                        # Parse header
                        header_line = line.decode('latin-1')
                        if ':' in header_line:
                            key, value = header_line.split(':', 1)
                            current_headers[key.strip().lower()] = value.strip()
                else:
                    # Accumulate data
                    if current_data:
                        current_data += b'\r\n'
                    current_data += line
        
        return form_data, files
    
    async def _process_part(self, current_part, headers, data, form_data, files):
        """Process a single multipart form part."""
        content_disposition = headers.get('content-disposition', '')
        
        if 'name=' not in content_disposition:
            return
            
        # Extract field name
        name_start = content_disposition.find('name="') + 6
        name_end = content_disposition.find('"', name_start)
        field_name = content_disposition[name_start:name_end]
        
        # Check if this is a file upload
        if 'filename=' in content_disposition:
            filename_start = content_disposition.find('filename="') + 10
            filename_end = content_disposition.find('"', filename_start)
            filename = content_disposition[filename_start:filename_end] if filename_start < filename_end else None
            
            content_type = headers.get('content-type', 'application/octet-stream')
            
            # Create custom SpooledTemporaryFile with our max_size
            temp_file = tempfile.SpooledTemporaryFile(max_size=self.max_size, mode='w+b')
            temp_file.write(data)
            temp_file.seek(0)
            
            upload_file = UploadFile(filename=filename, file=temp_file, content_type=content_type)
            files[field_name] = upload_file
        else:
            # Regular form field
            form_data[field_name] = _user_safe_decode(data, 'utf8')


def create_custom_multipart_parser(headers, stream, max_size: int = int(2.5 * 1024 * 1024)):
    """Factory function to create custom multipart parser with specified max_size."""
    return CustomMultiPartParser(headers, stream, max_size=max_size)
