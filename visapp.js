import puppeteer from "puppeteer"
export async function fillLatviaEmbassyForm() {
  // Configuration - modify these values as needed
  const formData = {
    firstName: 'John',
    lastName: 'Smith',
    email: 'johnsmith@example.com', 
    phone: '+12345678901', 
    service: 'Legalization of documents'

  };

  // Launch browser with options
  const browser = await puppeteer.launch({
    headless: process.env.NODE_ENV === 'production', // Set to true for production use
    defaultViewport: null,
    args: ['--start-maximized', '--no-sandbox', '--disable-setuid-sandbox'] // Added no-sandbox for Fly.io
  }).catch(error => {
    console.error('Failed to launch browser:', error);
    process.exit(1);
  });
  let page;
  try {
    page = await browser.newPage();

    // Navigate to the form page
    console.log('Navigating to form page...');
    await page.goto('https://pieraksts.mfa.gov.lv/en/egypt/index', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Wait for form to load
    await page.waitForSelector('#mfa-form1', { timeout: 30000,visible:true })
      .catch(() => {
        throw new Error('Form not found on page. Please check the URL.');
      });

    console.log('Form found, starting to fill out...');

    await fillField(page, '#Persons\\[0\\]\\[first_name\\]', formData.firstName);
    await fillField(page, '#Persons\\[0\\]\\[last_name\\]', formData.lastName);
    await fillField(page, '#e_mail', formData.email);
    await fillField(page, '#e_mail_repeat', formData.email);
    await fillField(page, '#phone', formData.phone);

    await page.screenshot({ path: '/data/step1-form-filled.png' });
    
    console.log('Step 1 form filled successfully! Screenshot saved as step1-form-filled.png');

    // Submit the form
    console.log('Submitting step1 form...');
    await page.click('.btn-next-step');

    // Wait for next page to load
    console.log('Waiting for step 2 page to load...');
    await page.waitForSelector('#mfa-form2', { 
      visible: true, 
      timeout: 60000 
    }).catch(error => {
      console.error('Failed to load step 2 form:', error.message);
      throw new Error('Step 2 form not found after submission');
    });
    await page.screenshot({ path: '/data/step2-initial.png' });
    console.log('Successfully navigated to step 2');
    console.log('Opening service dropdown...');
    await page.click('.js-services').catch(async error => {
      console.error('Failed to click on services dropdown:', error.message);
      await page.screenshot({ path: '/data/dropdown-error.png' });
      throw new Error('Could not open services dropdown');
    });

    await page.waitForSelector('.services--wrapper', { 
      visible: true, 
      timeout: 10000 
    });
    console.log(`Selecting service: ${formData.service}`);
        // Map service name to its ID from the form HTML

    const serviceIdMap = {
      'Submission of a request for a Residence Permit': 'Persons-0-201',
      'Submission of a request for the EU Blue Card': 'Persons-0-203',
      'Legalization of documents': 'Persons-0-202',
      'Requests for statements': 'Persons-0-218',
      'Obtaining a passport/eID card': 'Persons-0-214'
    };
    
    const serviceId = serviceIdMap[formData.service];

    if (!serviceId) {
      throw new Error(`Unknown service: ${formData.service}. Please use one of the known services.`);
    }
    
    // Click the service checkbox
    await page.click(`#${serviceId}`).catch(async error => {
      console.error(`Failed to select service ${formData.service}:`, error.message);
      await page.screenshot({ path: '/data/service-selection-error.png' });
      throw error;
    });
    console.log('Service selected, waiting for confirmation dialog...');
    

    // Wait for confirmation popup 

    await handleModal(page)

      // Click the confirmation checkbox
await sleep(200)
      await page.click('#active-confirmation').catch(async error => {
        console.error('Failed to click confirmation checkbox:', error.message);
        await page.screenshot({ path: '/data/checkbox-error.png' });
        throw error;
      });
      console.log('Confirmation checkbox checked, clicking Add button...');
    // Click the "Add" button

    await page.click(`.js-addService[data-serviceid="${serviceId}"]`).catch(async error => {
      console.error('Failed to click Add button:', error.message);
      await page.screenshot({ path: '/data/add-button-error.png' });
      throw error;
    });
    
    console.log('Service added successfully');


    // Take screenshot of selected service
    await page.screenshot({ path: '/data/service-selected.png' });
    
    // Submit the form (step 2)
    
    console.log('Submitting step 2 form...');
    await sleep(200)

    await page.click('#step2-next-btn .btn-next-step').catch(async error => {
      console.error('Failed to click Next step button:', error.message);
      await page.screenshot({ path: '/data/next-step-error.png' });
      throw error;
    });

  // Wait for next page or confirmation to load
  await page.waitForSelector('#mfa-form3', { 
    visible: true, 
    timeout: 60000 
  }).catch(error => {
    console.warn('Navigation after step 2 submission may have failed:', error.message);
    throw error
  });
 const isAvailable = await checkBookingAvailability(page)

 await page.screenshot({ path: '/data/embassy-booking-check.png' });

  console.log('Form process completed successfully! Check final-result.png for outcome.');

  return  isAvailable;



  } catch (error) {
    console.error('An error occurred: ', error);
   
      await page?.screenshot({ path: '/data/error-screenshot.png' });
      console.log('Error screenshot saved as error-screenshot.png');
    
  } finally {
    // Always close the browser
    if (browser) {
      await browser.close();
    }
    console.log('Browser closed.');
  }
}

/**
 * Helper function to fill a field with proper error handling
 */
async function fillField(page, selector, value) {
  try {
    await page.waitForSelector(selector, { visible: true, timeout: 10000 });

    // Clear the field first if it has any existing value
    await page.$eval(selector, el => el.value = '');

    // Type the value with small delay to simulate human-like typing
    await page.type(selector, value, { delay: 50 });

    console.log(`Field ${selector} filled successfully with: ${value}`);
  } catch (error) {
    console.error(`Failed to fill field ${selector}:`, error.message);
    throw new Error(`Could not fill field ${selector}: ${error.message}`);
  }
}



async function handleModal(page, modalSelector = '.description.active') {
  try {
    // Wait for modal to be fully visible
    await page.waitForSelector(modalSelector, { 
      visible: true, 
      timeout: 5000 
    });
    
    console.log('Modal detected and ready for interaction');
    return true;
  } catch {
    console.log('No modal detected or modal not yet ready');
    return false;
  }
}

async function checkBookingAvailability(page) {
 

  try {
    console.log('Checking for available booking dates...');
    await page.waitForSelector('.message',{timeout: 5000,visible:true}).catch(error => {
      console.log('No message content in message element found');
      return true;
    });

  const messageExists = async () => {
    const messageElement = await page.evaluate(() => {
      const element = document.querySelector('.message');
      return element ? element.textContent : null;
    });
    
    console.log('Message Element', messageElement);
    
    if (messageElement) {
      return messageElement.trim() === 'Currently all dates are fully booked';
    }
    return false;
  };
  const isExists = await messageExists()
    if (isExists) {
      console.log('RESULT: No available dates. Message "Currently all dates are fully booked" is present.');
      return false;
    } else {
      console.log('RESULT: Available dates found! The "fully booked" message is not present.');

      return true
    }

    
  } catch (error) {
    console.error('An error occurred:', error);
  } 
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}