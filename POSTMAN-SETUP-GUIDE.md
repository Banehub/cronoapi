# 🚀 Postman Setup Guide for CronoAPI Multi-Tenant System

## 📋 Prerequisites

1. **Postman Desktop App** - Download from [postman.com](https://www.postman.com/downloads/)
2. **CronoAPI Server Running** - Make sure your server is running on `http://localhost:8000`
3. **MongoDB Connected** - Ensure your MongoDB Atlas connection is working

## 🔧 Step-by-Step Setup

### 1. Import the Collection

1. Open Postman
2. Click **Import** button (top left)
3. Select **Upload Files**
4. Choose the `CronoAPI-Postman-Collection.json` file
5. Click **Import**

### 2. Set Up Environment Variables

The collection comes with pre-configured variables, but you can create a custom environment:

1. Click the **Environments** tab (left sidebar)
2. Click **Create Environment**
3. Name it: `CronoAPI Local`
4. Add these variables:

| Variable | Initial Value | Current Value |
|----------|---------------|---------------|
| `baseUrl` | `http://localhost:8000` | `http://localhost:8000` |
| `companyToken` | (leave empty) | (leave empty) |
| `userToken` | (leave empty) | (leave empty) |
| `companyId` | (leave empty) | (leave empty) |
| `userId` | (leave empty) | (leave empty) |

5. Click **Save**
6. Select your environment from the dropdown (top right)

### 3. Start Your Server

```bash
# In your terminal, navigate to your project directory
cd C:\Users\Willie\Documents\Repo\cronoapi

# Install dependencies (if not already done)
npm install

# Start the server
npm run dev
# or
npm start
```

## 🎯 Testing Workflow

### Phase 1: Company Setup
1. **Register Company** - Creates your first company
2. **Login Company** - Authenticates the company
3. **Get Company Profile** - Verifies company data
4. **Get Company Stats** - Check company statistics

### Phase 2: User Management
1. **Register User** - Create users under the company
2. **Login User** - Authenticate users
3. **Get User Profile** - Verify user data

### Phase 3: Core Features
1. **Create Ticket** - Test ticket creation
2. **Create Conversation** - Test chat functionality
3. **Send Message** - Test messaging
4. **Get All Data** - Verify data isolation

## 🔑 Important Notes

### Authentication Flow
- **Company Token**: Used for company-level operations
- **User Token**: Used for user-level operations
- **Auto-Set Variables**: The collection automatically sets tokens and IDs

### Multi-Tenant Testing
1. **Create Multiple Companies**: Register different companies
2. **Create Users in Each**: Register users under different companies
3. **Test Data Isolation**: Verify users can only see their company's data

### Token Management
- Tokens are automatically stored in collection variables
- No need to manually copy/paste tokens
- Tokens expire after 7 days (configurable)

## 🧪 Testing Scenarios

### Scenario 1: Single Company Setup
```
1. Register Company → Get companyId
2. Register User (with companyId) → Get userToken
3. Create Ticket → Verify company isolation
4. Create Conversation → Test chat
5. Send Messages → Test messaging
```

### Scenario 2: Multi-Company Testing
```
1. Register Company A → Get companyAId
2. Register Company B → Get companyBId
3. Register User A (Company A) → Get userAToken
4. Register User B (Company B) → Get userBToken
5. Create data for both companies
6. Verify User A cannot see Company B's data
7. Verify User B cannot see Company A's data
```

## 🐛 Troubleshooting

### Common Issues

**1. "Connection refused" Error**
- Make sure your server is running on port 8000
- Check if the baseUrl is correct in environment variables

**2. "Invalid token" Error**
- Make sure you're using the correct token type (company vs user)
- Check if the token has expired
- Verify the Authorization header format: `Bearer YOUR_TOKEN`

**3. "Company ID required" Error**
- Make sure you've registered a company first
- Check if the companyId variable is set correctly
- Verify the company is active

**4. "Access denied" Error**
- Check user permissions and roles
- Verify the user belongs to the correct company
- Ensure the resource belongs to the user's company

### Debug Tips

1. **Check Console Logs**: Look at the Postman Console for detailed error messages
2. **Verify Variables**: Check if all required variables are set
3. **Test Health Endpoint**: Use the Health Check to verify server connectivity
4. **Check Server Logs**: Look at your terminal for server-side errors

## 📊 Expected Responses

### Successful Company Registration
```json
{
  "success": true,
  "message": "Company registered successfully",
  "data": {
    "company": {
      "_id": "company_id_here",
      "name": "Acme Corporation",
      "email": "admin@acme.com",
      "slug": "acme-corporation"
    },
    "token": "jwt_token_here"
  }
}
```

### Successful User Registration
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "_id": "user_id_here",
      "name": "John Doe",
      "email": "john@acme.com",
      "role": "user"
    },
    "company": {
      "_id": "company_id_here",
      "name": "Acme Corporation"
    },
    "token": "jwt_token_here"
  }
}
```

## 🎉 You're Ready!

Once you've completed the setup, you can:

1. **Test all endpoints** systematically
2. **Verify multi-tenant isolation** works correctly
3. **Create realistic test data** for your application
4. **Debug any issues** using the comprehensive error responses

The collection includes all the necessary requests to test your multi-tenant CronoAPI system thoroughly!

## 📞 Need Help?

If you encounter any issues:
1. Check the server logs in your terminal
2. Verify all environment variables are set
3. Ensure your MongoDB connection is working
4. Test the health endpoint first

Happy testing! 🚀
