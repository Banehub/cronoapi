# 📁 Automatic Folder System for CronoAPI

## 🎯 Overview

Your CronoAPI now automatically creates organized folder structures in the database as companies and their data are created. This provides a hierarchical organization system that makes data management intuitive and organized.

## 🏗️ How It Works

### Automatic Folder Creation

When certain actions happen in your API, folders are automatically created:

1. **🏢 Company Registration** → Creates main company folder + system subfolders
2. **👤 User Registration** → Creates user folder under `/Users/`
3. **🎫 Ticket Creation** → Creates ticket folder under `/Tickets/`
4. **💬 Conversation Creation** → Creates conversation folder under `/Conversations/`

### Folder Structure Example

```
📁 Acme Corporation (company)
├── 📁 Users (users)
│   ├── 📁 John Doe (custom)
│   ├── 📁 Jane Smith (custom)
│   └── 📁 Admin User (custom)
├── 📁 Tickets (tickets)
│   ├── 📁 TICKET-12345678 (custom)
│   ├── 📁 TICKET-87654321 (custom)
│   └── 📁 TICKET-11223344 (custom)
├── 📁 Conversations (conversations)
│   ├── 📁 Project Discussion (custom)
│   ├── 📁 Team Chat (custom)
│   └── 📁 Client Meeting (custom)
├── 📁 Messages (messages)
└── 📁 Attachments (attachments)
```

## 🔧 Technical Implementation

### Models Created

1. **Folder Model** (`models/Folder.js`)
   - Hierarchical folder structure
   - Company-based isolation
   - Path-based organization
   - System vs custom folders

2. **Folder Service** (`services/folderService.js`)
   - Automatic folder creation
   - Folder management operations
   - Tree structure building
   - Statistics and analytics

### API Endpoints

- `GET /api/folders/tree` - Get complete folder tree
- `GET /api/folders/stats` - Get folder statistics
- `GET /api/folders/:id/contents` - Get folder contents
- `POST /api/folders` - Create custom folder
- `PUT /api/folders/:id/rename` - Rename folder
- `PUT /api/folders/:id/move` - Move folder
- `DELETE /api/folders/:id` - Delete folder
- `GET /api/folders/path/:path` - Get folder by path

## 🚀 Usage Examples

### 1. Company Registration
```javascript
// When a company is registered, this folder structure is automatically created:
const company = await Company.create({
  name: "Acme Corporation",
  email: "admin@acme.com",
  password: "password123"
});

// Automatically creates:
// 📁 Acme Corporation/
// ├── 📁 Users/
// ├── 📁 Tickets/
// ├── 📁 Conversations/
// ├── 📁 Messages/
// └── 📁 Attachments/
```

### 2. User Registration
```javascript
// When a user is registered, a personal folder is created:
const user = await User.create({
  name: "John Doe",
  email: "john@acme.com",
  password: "password123",
  companyId: company._id
});

// Automatically creates:
// 📁 Acme Corporation/Users/John Doe/
```

### 3. Ticket Creation
```javascript
// When a ticket is created, a ticket folder is created:
const ticket = await Ticket.create({
  subject: "Login Issue",
  description: "User cannot login",
  userId: user._id,
  companyId: company._id
});

// Automatically creates:
// 📁 Acme Corporation/Tickets/TICKET-12345678/
```

### 4. Conversation Creation
```javascript
// When a conversation is created, a conversation folder is created:
const conversation = await Conversation.create({
  title: "Project Discussion",
  participants: [user1._id, user2._id],
  companyId: company._id,
  createdBy: user1._id
});

// Automatically creates:
// 📁 Acme Corporation/Conversations/Project Discussion/
```

## 📊 Folder Types

### System Folders (Cannot be deleted/renamed)
- **company**: Main company folder
- **users**: Container for user folders
- **tickets**: Container for ticket folders
- **conversations**: Container for conversation folders
- **messages**: Container for message data
- **attachments**: Container for file uploads

### Custom Folders (User-manageable)
- **custom**: User-created folders
- User personal folders
- Ticket-specific folders
- Conversation-specific folders

## 🔒 Multi-Tenant Isolation

Each company has its own completely isolated folder structure:

```
📁 Company A/
├── 📁 Users/
├── 📁 Tickets/
└── 📁 Conversations/

📁 Company B/
├── 📁 Users/
├── 📁 Tickets/
└── 📁 Conversations/
```

Users from Company A cannot see or access folders from Company B.

## 🎛️ Folder Management

### Create Custom Folder
```bash
POST /api/folders
{
  "name": "My Custom Folder",
  "parentFolderId": "parent_folder_id",
  "description": "A custom folder for organizing data"
}
```

### Get Folder Tree
```bash
GET /api/folders/tree
# Returns complete hierarchical structure
```

### Get Folder Contents
```bash
GET /api/folders/:folderId/contents
# Returns subfolders and related data
```

### Move Folder
```bash
PUT /api/folders/:folderId/move
{
  "newParentFolderId": "new_parent_id"
}
```

## 📈 Benefits

1. **🗂️ Organized Data**: Automatic organization of all company data
2. **🔍 Easy Navigation**: Hierarchical structure makes finding data simple
3. **🏢 Company Isolation**: Each company has its own folder structure
4. **📊 Analytics**: Folder statistics and usage tracking
5. **🔧 Management**: Full CRUD operations on folders
6. **🎯 Intuitive**: Folder structure mirrors real-world organization

## 🧪 Testing

The system has been thoroughly tested and verified:

- ✅ Company folder structure creation
- ✅ User folder creation
- ✅ Ticket folder creation
- ✅ Conversation folder creation
- ✅ Hierarchical organization
- ✅ Multi-tenant isolation
- ✅ Folder management operations

## 🎉 Result

Your CronoAPI now automatically creates organized "folders" in the database as things happen, providing:

- **Automatic Organization**: No manual folder creation needed
- **Company Isolation**: Each company has its own folder structure
- **Hierarchical Structure**: Easy to navigate and understand
- **Full Management**: Create, rename, move, and delete folders
- **Data Association**: Folders are linked to actual data

The folder system makes your multi-tenant API feel like a real file system, where each company has their own organized workspace! 🚀
