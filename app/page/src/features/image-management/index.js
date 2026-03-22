// Entry file for the frontend image management feature
import './upload.css';

// Simple image upload form
const uploadImageForm = `
  <form id="uploadForm">
    <label for="imageUpload">Upload Image:</label>
    <input type="file" id="imageUpload" name="imageFile" />
    <button type="submit">Upload</button>
  </form>
`;

document.getElementById('app').innerHTML = uploadImageForm;