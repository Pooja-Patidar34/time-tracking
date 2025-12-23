from flask import Flask, jsonify, request, send_from_directory
import json, os
from datetime import datetime

app = Flask(__name__)
DATA_FILE = "data.json"

# --- Helpers ---
def read_data():
    if not os.path.exists(DATA_FILE):
        init_data = {
            "next_entry_id": 1,
            "employees": [],
            "projects": [],
            "tasks": [],
            "time_entries": []
        }
        write_data(init_data)

    with open(DATA_FILE, "r") as f:
        data = json.load(f)

    # Ensure next_entry_id exists
    if "next_entry_id" not in data:
        data["next_entry_id"] = 1

    # Migration: assign IDs to entries that don't have one
    changed = False
    for entry in data["time_entries"]:
        if "id" not in entry:
            entry["id"] = data["next_entry_id"]
            data["next_entry_id"] += 1
            changed = True

    if changed:
        write_data(data)

    return data

def has_materials(entry):
    return "materials_used" in entry and entry["materials_used"]


def write_data(data):
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2)

# --- API routes ---
@app.route("/api/employees")
def get_employees():
    return jsonify(read_data()["employees"])

@app.route("/api/projects")
def get_projects():
    return jsonify(read_data()["projects"])

@app.route("/api/tasks")
def get_tasks():
    return jsonify(read_data()["tasks"])

@app.route("/api/time-entries")
def get_time_entries():
    return jsonify(read_data()["time_entries"])

@app.route("/api/materials")
def get_materials():
    return jsonify(read_data().get("materials", []))


@app.route("/api/submit-time", methods=["POST"])
def submit_time():
    data = read_data()
    body = request.get_json()

    required = ["employee_id", "project_id", "task_id", "minutes_spent"]
    if not all(k in body for k in required):
        return jsonify({"success": False, "error": "Missing fields"}), 400

    if "next_entry_id" not in data:
        data["next_entry_id"] = 1

    new_entry = {
        "id": data["next_entry_id"],
        "employee_id": body["employee_id"],
        "project_id": body["project_id"],
        "task_id": body["task_id"],
        "minutes_spent": body["minutes_spent"],
        "timestamp": body.get("timestamp", datetime.utcnow().isoformat()),
        "approved": False,
        "materials_used": body.get("materials_used")  # optional field
    }
    if body.get("materials_used"):
        mat = body["materials_used"]
        new_entry["materials_used"] = {
            "material_id": mat.get("material_id"),
            "notes": mat.get("notes", ""),
            "reviewed": False  # 👈 new field
        }
        new_entry["materials_entered"] = False
    data["time_entries"].append(new_entry)
    data["next_entry_id"] += 1
    write_data(data)

    return jsonify({"success": True, "entry": new_entry})

@app.route("/api/edit-time", methods=["POST"])
def edit_time():
    body = request.get_json()
    if "id" not in body or "updated" not in body:
        return jsonify({"success": False, "error": "Missing id or updated"}), 400

    data = read_data()
    for i, entry in enumerate(data["time_entries"]):
        if entry["id"] == body["id"]:
            updated = body["updated"]
            updated["id"] = entry["id"]
            updated["approved"] = True

            # Preserve materials_used if not included in update
            if "materials_used" not in updated and "materials_used" in entry:
                updated["materials_used"] = entry["materials_used"]

            # Preserve materials_entered if not included in update
            if "materials_entered" not in updated and "materials_entered" in entry:
                updated["materials_entered"] = entry["materials_entered"]

            data["time_entries"][i] = updated
            write_data(data)

            return jsonify({"success": True, "entry": updated})

    return jsonify({"success": False, "error": "Entry not found"}), 404


@app.route("/api/delete-time", methods=["POST"])
def delete_time():
    body = request.get_json()
    if "id" not in body:
        return jsonify({"success": False, "error": "Missing entry id"}), 400

    data = read_data()
    before = len(data["time_entries"])
    data["time_entries"] = [e for e in data["time_entries"] if e["id"] != body["id"]]

    if len(data["time_entries"]) == before:
        return jsonify({"success": False, "error": "Entry not found"}), 404

    write_data(data)
    return jsonify({"success": True}), 200


@app.route("/api/add-employee", methods=["POST"])
def add_employee():
    body = request.get_json()
    if not body.get("id") or not body.get("name"):
        return jsonify({"success": False, "error": "Missing id or name"}), 400

    data = read_data()

    # Prevent duplicate employee IDs
    if any(emp["id"] == body["id"] for emp in data["employees"]):
        return jsonify({"success": False, "error": "Employee ID already exists"}), 400

    data["employees"].append({"id": body["id"], "name": body["name"]})
    write_data(data)
    return jsonify({"success": True}), 200

@app.route("/api/delete-employee", methods=["POST"])
def delete_employee():
    body = request.get_json()
    if not body.get("id"):
        return jsonify({"success": False, "error": "Missing employee id"}), 400

    data = read_data()

    # Remove employee by ID
    new_list = [emp for emp in data["employees"] if emp["id"] != body["id"]]
    if len(new_list) == len(data["employees"]):
        return jsonify({"success": False, "error": "Employee not found"}), 404

    data["employees"] = new_list
    write_data(data)
    return jsonify({"success": True}), 200


@app.route("/api/add-project", methods=["POST"])
def add_project():
    body = request.get_json()
    if not body.get("id") or not body.get("name"):
        return jsonify({"success": False, "error": "Missing id or name"}), 400

    data = read_data()

    if any(proj["id"] == body["id"] for proj in data["projects"]):
        return jsonify({"success": False, "error": "Project ID already exists"}), 400

    project = {
        "id": body["id"],
        "name": body["name"],
        "task_budgets": body.get("task_budgets", {})  # Optional
    }

    data["projects"].append(project)
    write_data(data)
    return jsonify({"success": True}), 200

@app.route("/api/material-logs")
def get_material_logs():
    data = read_data()
    pending = []
    completed = []

    for entry in data["time_entries"]:
        if entry.get("approved") and has_materials(entry):
            target = completed if entry.get("materials_entered") else pending
            target.append(entry)

    return jsonify({"pending": pending, "completed": completed})

@app.route("/api/mark-material-reviewed", methods=["POST"])
def mark_material_reviewed():
    body = request.get_json()
    if not body.get("id"):
        return jsonify({"success": False, "error": "Missing id"}), 400

    data = read_data()
    for entry in data["time_entries"]:
        if entry["id"] == body["id"] and entry.get("materials_used"):
            entry["materials_used"]["reviewed"] = True
            write_data(data)
            return jsonify({"success": True})

    return jsonify({"success": False, "error": "Entry not found"}), 404


@app.route("/api/reported-materials")
def get_reported_materials():
    data = read_data()
    entries = []

    for e in data["time_entries"]:
        if not e.get("approved") or not e.get("materials_used"):
            continue

        entries.append({
            "id": e["id"],
            "employee_id": e["employee_id"],
            "project_id": e["project_id"],
            "task_id": e["task_id"],
            "material_id": e["materials_used"]["material_id"],
            "notes": e["materials_used"].get("notes", ""),
            "timestamp": e["timestamp"],
            "reviewed": e["materials_used"].get("reviewed", False),

            # 👇 Add these lines to include names
            "employee_name": next((emp["name"] for emp in data["employees"] if emp["id"] == e["employee_id"]), ""),
            "material_name": next((m["name"] for m in data.get("materials", []) if m["id"] == e["materials_used"]["material_id"]), "")
        })

    return jsonify(entries)

@app.route("/api/materials-reviewed")
def get_reviewed_material_entries():
    data = read_data()
    entries = []

    for e in data.get("time_entries", []):
        if not e.get("approved") or not e.get("materials_used"):
            continue

        if e["materials_used"].get("reviewed") is True:
            entries.append({
                "id": e["id"],
                "employee_id": e["employee_id"],
                "project_id": e["project_id"],
                "task_id": e["task_id"],
                "material_id": e["materials_used"]["material_id"],
                "notes": e["materials_used"].get("notes", ""),
                "timestamp": e["timestamp"],
                "employee_name": next((emp["name"] for emp in data["employees"] if emp["id"] == e["employee_id"]), ""),
                "material_name": next((m["name"] for m in data.get("materials", []) if m["id"] == e["materials_used"]["material_id"]), "")
            })

    return jsonify(entries)


@app.route("/api/materials-unreviewed")
def get_unreviewed_material_entries():
    data = read_data()
    entries = []

    for e in data.get("time_entries", []):
        if not e.get("approved") or not e.get("materials_used"):
            continue

        if e["materials_used"].get("reviewed") is not True:
            entries.append({
                "id": e["id"],
                "employee_id": e["employee_id"],
                "project_id": e["project_id"],
                "task_id": e["task_id"],
                "material_id": e["materials_used"]["material_id"],
                "notes": e["materials_used"].get("notes", ""),
                "timestamp": e["timestamp"],
                "employee_name": next((emp["name"] for emp in data["employees"] if emp["id"] == e["employee_id"]), ""),
                "material_name": next((m["name"] for m in data.get("materials", []) if m["id"] == e["materials_used"]["material_id"]), "")
            })

    return jsonify(entries)




# --- Frontend routes ---
@app.route("/")
def root():
    return "<h2>Server running ✅. Visit <a href='/time'>Time Tracking</a> or <a href='/admin'>Admin</a>.</h2>"

@app.route("/time")
def serve_time():
    return send_from_directory("Time_tracking", "index.html")

@app.route("/admin")
def serve_admin():
    return send_from_directory("Admin_App", "index.html")

@app.route("/time/<path:path>")
def serve_time_static(path):
    return send_from_directory("Time_tracking", path)

@app.route("/admin/<path:path>")
def serve_admin_static(path):
    return send_from_directory("Admin_App", path)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)