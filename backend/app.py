from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

def calculate_rul(asset):
    age = asset.get('age', 0)
    load = asset.get('load', 0)
    inspection_score = asset.get('inspection_score', 100)
    last_maintenance = asset.get('last_maintenance_years', 0)
    asset_type = asset.get('type', 'bridge')

    base_rul = 50 if asset_type == 'bridge' else (40 if asset_type == 'road' else 30)

    age_penalty = age * 0.5
    load_penalty = load * 0.2
    maintenance_penalty = last_maintenance * 2
    inspection_penalty = (100 - inspection_score) * 0.4

    estimated_rul = base_rul - age_penalty - load_penalty - maintenance_penalty - inspection_penalty
    estimated_rul = max(0, round(estimated_rul, 1))

    anomaly = False
    reasons = []
    if load > 80:
        anomaly = True
        reasons.append("High load")
    if last_maintenance >= 3:
        anomaly = True
        reasons.append(f"{last_maintenance}yr since maintenance")
    if inspection_score < 50:
        anomaly = True
        reasons.append("Poor inspection score")
    if age > (base_rul * 0.8):
        anomaly = True
        reasons.append("Near end of design life")
        
    explanation = ""
    status = "stable"
    if estimated_rul <= 3 or anomaly:
        status = "critical"
        if reasons:
            explanation = f"{asset.get('name', 'Asset')}: {' + '.join(reasons)} → Failure risk in ~{int(estimated_rul*12)} months"
    elif estimated_rul <= 7:
        status = "watch"
        explanation = f"{asset.get('name', 'Asset')}: Needs attention, {last_maintenance}yr since maintenance → Evaluate in ~{int((estimated_rul-2)*12)} months"
    else:
        status = "stable"

    return {
        "estimated_rul": estimated_rul,
        "anomaly": anomaly,
        "status": status,
        "explanation": explanation
    }

@app.route('/api/predict', methods=['POST'])
def predict():
    data = request.json
    result = calculate_rul(data)
    return jsonify(result)

@app.route('/api/predict_all', methods=['POST'])
def predict_all():
    assets = request.json.get('assets', [])
    results = []
    for asset in assets:
        pred = calculate_rul(asset)
        results.append({**asset, **pred})
    return jsonify(results)

if __name__ == '__main__':
    app.run(debug=True, port=5000)
