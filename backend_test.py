#!/usr/bin/env python3
"""
Restaurant POS Backend API Testing
Tests authentication endpoints and health check
"""

import requests
import json
import sys
from typing import Dict, Any

# Get backend URL from frontend .env
BACKEND_URL = "https://secureserve-pos.preview.emergentagent.com/api"

class RestaurantPOSAPITester:
    def __init__(self):
        self.base_url = BACKEND_URL
        self.session = requests.Session()
        self.test_results = []
        
    def log_test(self, test_name: str, success: bool, details: str = ""):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"   Details: {details}")
        
        self.test_results.append({
            "test": test_name,
            "success": success,
            "details": details
        })
    
    def test_health_check(self):
        """Test API health check endpoint"""
        try:
            response = self.session.get(f"{self.base_url}/")
            
            if response.status_code == 200:
                data = response.json()
                expected_message = "Restaurant POS API"
                expected_status = "online"
                
                if data.get("message") == expected_message and data.get("status") == expected_status:
                    self.log_test("Health Check", True, f"Response: {data}")
                else:
                    self.log_test("Health Check", False, f"Unexpected response: {data}")
            else:
                self.log_test("Health Check", False, f"Status: {response.status_code}, Response: {response.text}")
                
        except Exception as e:
            self.log_test("Health Check", False, f"Exception: {str(e)}")
    
    def test_pin_authentication(self):
        """Test PIN-based authentication for all roles"""
        pin_credentials = [
            {"username": "admin", "credential": "1234", "role": "admin", "name": "Admin User"},
            {"username": "manager", "credential": "5678", "role": "manager", "name": "Manager User"},
            {"username": "captain", "credential": "9012", "role": "captain", "name": "Captain User"},
            {"username": "cashier", "credential": "3456", "role": "cashier", "name": "Cashier User"}
        ]
        
        for cred in pin_credentials:
            try:
                payload = {
                    "username": cred["username"],
                    "credential": cred["credential"],
                    "mode": "pin"
                }
                
                response = self.session.post(f"{self.base_url}/auth/login", json=payload)
                
                if response.status_code == 200:
                    data = response.json()
                    user = data.get("user", {})
                    
                    # Verify response structure and data
                    if (user.get("username") == cred["username"] and 
                        user.get("role") == cred["role"] and
                        user.get("name") == cred["name"] and
                        data.get("message") == "Login successful"):
                        self.log_test(f"PIN Auth - {cred['username']}", True, f"Role: {user.get('role')}")
                    else:
                        self.log_test(f"PIN Auth - {cred['username']}", False, f"Invalid response data: {data}")
                else:
                    self.log_test(f"PIN Auth - {cred['username']}", False, f"Status: {response.status_code}, Response: {response.text}")
                    
            except Exception as e:
                self.log_test(f"PIN Auth - {cred['username']}", False, f"Exception: {str(e)}")
    
    def test_password_authentication(self):
        """Test password-based authentication for all roles"""
        password_credentials = [
            {"username": "admin", "credential": "admin123", "role": "admin", "name": "Admin User"},
            {"username": "manager", "credential": "manager123", "role": "manager", "name": "Manager User"},
            {"username": "captain", "credential": "captain123", "role": "captain", "name": "Captain User"},
            {"username": "cashier", "credential": "cashier123", "role": "cashier", "name": "Cashier User"}
        ]
        
        for cred in password_credentials:
            try:
                payload = {
                    "username": cred["username"],
                    "credential": cred["credential"],
                    "mode": "password"
                }
                
                response = self.session.post(f"{self.base_url}/auth/login", json=payload)
                
                if response.status_code == 200:
                    data = response.json()
                    user = data.get("user", {})
                    
                    # Verify response structure and data
                    if (user.get("username") == cred["username"] and 
                        user.get("role") == cred["role"] and
                        user.get("name") == cred["name"] and
                        data.get("message") == "Login successful"):
                        self.log_test(f"Password Auth - {cred['username']}", True, f"Role: {user.get('role')}")
                    else:
                        self.log_test(f"Password Auth - {cred['username']}", False, f"Invalid response data: {data}")
                else:
                    self.log_test(f"Password Auth - {cred['username']}", False, f"Status: {response.status_code}, Response: {response.text}")
                    
            except Exception as e:
                self.log_test(f"Password Auth - {cred['username']}", False, f"Exception: {str(e)}")
    
    def test_invalid_credentials(self):
        """Test authentication with invalid credentials"""
        invalid_tests = [
            {"username": "admin", "credential": "9999", "mode": "pin", "test_name": "Wrong PIN"},
            {"username": "admin", "credential": "wrongpass", "mode": "password", "test_name": "Wrong Password"},
            {"username": "nonexistent", "credential": "1234", "mode": "pin", "test_name": "Non-existent User"},
            {"username": "manager", "credential": "1111", "mode": "pin", "test_name": "Wrong Manager PIN"},
        ]
        
        for test_case in invalid_tests:
            try:
                payload = {
                    "username": test_case["username"],
                    "credential": test_case["credential"],
                    "mode": test_case["mode"]
                }
                
                response = self.session.post(f"{self.base_url}/auth/login", json=payload)
                
                if response.status_code == 401:
                    self.log_test(f"Invalid Creds - {test_case['test_name']}", True, "Correctly rejected with 401")
                else:
                    self.log_test(f"Invalid Creds - {test_case['test_name']}", False, f"Expected 401, got {response.status_code}")
                    
            except Exception as e:
                self.log_test(f"Invalid Creds - {test_case['test_name']}", False, f"Exception: {str(e)}")
    
    def run_all_tests(self):
        """Run all backend API tests"""
        print(f"🚀 Starting Restaurant POS Backend API Tests")
        print(f"📡 Backend URL: {self.base_url}")
        print("=" * 60)
        
        # Run tests
        self.test_health_check()
        print()
        
        print("🔐 Testing PIN Authentication:")
        self.test_pin_authentication()
        print()
        
        print("🔑 Testing Password Authentication:")
        self.test_password_authentication()
        print()
        
        print("❌ Testing Invalid Credentials:")
        self.test_invalid_credentials()
        print()
        
        # Summary
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results if result["success"])
        failed_tests = total_tests - passed_tests
        
        print("=" * 60)
        print(f"📊 TEST SUMMARY:")
        print(f"   Total Tests: {total_tests}")
        print(f"   ✅ Passed: {passed_tests}")
        print(f"   ❌ Failed: {failed_tests}")
        print(f"   Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        
        if failed_tests > 0:
            print("\n🔍 FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"   • {result['test']}: {result['details']}")
        
        return failed_tests == 0

if __name__ == "__main__":
    tester = RestaurantPOSAPITester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)