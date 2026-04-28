# 📧 Email Setup (No OTP Required)

## Email configuration is not required for login.

The OTP-based login system has been removed. Users can now log in directly with their college email address (e.g., 2301201171@krmu.edu.in) without receiving or entering an OTP.

If you wish to enable email features for other purposes (such as notifications), configure your email settings in `backend/.env` as needed.

---

## Troubleshooting

- If you encounter issues with login, ensure you are using your college email address.

### "Username and Password not accepted" error?
- ❌ Don't use your Gmail password
- ✅ Use the 16-character app password
- ✅ Remove all spaces from app password

---

## Testing Without Email (Demo Mode)

If email is not configured, OTP will show in:
- Browser alert popup
- Backend console logs

This is useful for development/testing!
